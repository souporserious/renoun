import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import type { ProjectOptions } from '../project/types.ts'
import { getDebugLogger } from '../utils/debug.ts'

const PREWARM_WORKER_PAYLOAD_ENV_KEY = 'RENOUN_PREWARM_WORKER_PAYLOAD'

interface PrewarmWorkerMessage {
  type?: unknown
  durationMs?: unknown
  error?: unknown
  priority?: unknown
}

interface PrewarmRequest {
  options?: { projectOptions?: ProjectOptions }
  signature: string
}

function isTestRuntime(): boolean {
  return (
    process.env['VITEST'] !== undefined ||
    process.env['VITEST_WORKER_ID'] !== undefined ||
    process.env['NODE_ENV'] === 'test' ||
    process.argv.some((argument) => argument.includes('vitest'))
  )
}

function resolvePrewarmWorkerEntryFilePath(): string | undefined {
  const workerEntryFilePath = fileURLToPath(
    new URL('./prewarm.worker.js', import.meta.url)
  )

  return existsSync(workerEntryFilePath) ? workerEntryFilePath : undefined
}

function getPrewarmRequestSignature(options?: {
  projectOptions?: ProjectOptions
}): string {
  try {
    return JSON.stringify(options ?? null) ?? 'null'
  } catch {
    return options?.projectOptions?.tsConfigFilePath ?? 'unknown'
  }
}

async function runPrewarmInline(
  options?: { projectOptions?: ProjectOptions },
  startedAt = Date.now()
): Promise<void> {
  try {
    const { prewarmRenounRpcServerCache } = await import('./prewarm.ts')
    await prewarmRenounRpcServerCache(options)

    getDebugLogger().info('Renoun RPC cache prewarm completed', () => ({
      data: {
        status: 'finished',
        durationMs: Date.now() - startedAt,
        execution: 'inline',
      },
    }))
  } catch (error) {
    getDebugLogger().warn('Failed to prewarm Renoun RPC cache', () => ({
      data: {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        execution: 'inline',
      },
    }))
  }
}

function isValidPrewarmWorkerMessage(
  value: unknown
): value is PrewarmWorkerMessage {
  return typeof value === 'object' && value !== null
}

function parsePrewarmWorkerDurationMs(
  message: PrewarmWorkerMessage,
  fallbackDurationMs: number
): number {
  return typeof message.durationMs === 'number' &&
    Number.isFinite(message.durationMs) &&
    message.durationMs >= 0
    ? message.durationMs
    : fallbackDurationMs
}

function parsePrewarmWorkerErrorMessage(message: PrewarmWorkerMessage): string {
  if (typeof message.error === 'string' && message.error.length > 0) {
    return message.error
  }

  return 'Prewarm worker reported an error'
}

function parsePrewarmWorkerPriority(message: PrewarmWorkerMessage): number | undefined {
  return typeof message.priority === 'number' && Number.isFinite(message.priority)
    ? message.priority
    : undefined
}

let activePrewarmRequest: PrewarmRequest | undefined
let pendingPrewarmRequest: PrewarmRequest | undefined

function finalizeActivePrewarmRequest(signature: string): void {
  if (!activePrewarmRequest || activePrewarmRequest.signature !== signature) {
    return
  }

  activePrewarmRequest = undefined

  const nextPrewarmRequest = pendingPrewarmRequest
  pendingPrewarmRequest = undefined

  if (nextPrewarmRequest) {
    startPrewarmRequest(nextPrewarmRequest)
  }
}

function queueOrSkipPrewarmRequest(request: PrewarmRequest): boolean {
  if (!activePrewarmRequest) {
    return false
  }

  if (activePrewarmRequest.signature === request.signature) {
    getDebugLogger().debug(
      'Skipping prewarm request because matching prewarm is already running'
    )
    return true
  }

  if (pendingPrewarmRequest?.signature === request.signature) {
    getDebugLogger().debug(
      'Skipping prewarm request because matching prewarm is already queued'
    )
    return true
  }

  pendingPrewarmRequest = request
  getDebugLogger().info('Queued Renoun RPC cache prewarm request', () => ({
    data: { status: 'queued' },
  }))
  return true
}

function startPrewarmRequest(request: PrewarmRequest): void {
  const startedAt = Date.now()
  activePrewarmRequest = request

  getDebugLogger().info('Renoun RPC cache prewarm started', () => ({
    data: { status: 'running' },
  }))

  const workerEntryFilePath = resolvePrewarmWorkerEntryFilePath()
  if (isTestRuntime() || !workerEntryFilePath) {
    void runPrewarmInline(request.options, startedAt).finally(() => {
      finalizeActivePrewarmRequest(request.signature)
    })
    return
  }

  let didHandleTerminalMessage = false
  let didFinalize = false
  const finalizeWorker = () => {
    if (didFinalize) {
      return
    }

    didFinalize = true
    finalizeActivePrewarmRequest(request.signature)
  }

  try {
    const prewarmWorkerProcess = spawn(
      process.execPath,
      [workerEntryFilePath],
      {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        shell: false,
        env: {
          ...process.env,
          [PREWARM_WORKER_PAYLOAD_ENV_KEY]: JSON.stringify({
            projectOptions: request.options?.projectOptions,
          }),
        },
      }
    )
    prewarmWorkerProcess.on('message', (message) => {
      if (!isValidPrewarmWorkerMessage(message)) {
        return
      }

      const fallbackDurationMs = Date.now() - startedAt
      if (message.type === 'started') {
        const priority = parsePrewarmWorkerPriority(message)
        getDebugLogger().debug('Renoun prewarm worker running', () => ({
          data: {
            durationMs: parsePrewarmWorkerDurationMs(
              message,
              fallbackDurationMs
            ),
            priority,
            execution: 'worker',
          },
        }))
        return
      }

      if (message.type === 'completed') {
        didHandleTerminalMessage = true
        getDebugLogger().info('Renoun RPC cache prewarm completed', () => ({
          data: {
            status: 'finished',
            durationMs: parsePrewarmWorkerDurationMs(
              message,
              fallbackDurationMs
            ),
            execution: 'worker',
          },
        }))
        return
      }

      if (message.type === 'error') {
        didHandleTerminalMessage = true
        getDebugLogger().warn('Failed to prewarm Renoun RPC cache', () => ({
          data: {
            error: parsePrewarmWorkerErrorMessage(message),
            durationMs: parsePrewarmWorkerDurationMs(
              message,
              fallbackDurationMs
            ),
            execution: 'worker',
          },
        }))
      }
    })

    prewarmWorkerProcess.once('error', (error) => {
      if (!didHandleTerminalMessage) {
        getDebugLogger().warn(
          'Failed to launch Renoun RPC cache prewarm worker',
          () => ({
            data: {
              error: error.message,
              durationMs: Date.now() - startedAt,
              execution: 'worker',
            },
          })
        )
      }
      finalizeWorker()
    })

    prewarmWorkerProcess.once('exit', (code, signal) => {
      if (!didHandleTerminalMessage) {
        if ((code ?? 0) === 0) {
          getDebugLogger().info('Renoun RPC cache prewarm completed', () => ({
            data: {
              status: 'finished',
              durationMs: Date.now() - startedAt,
              execution: 'worker',
            },
          }))
        } else {
          getDebugLogger().warn('Renoun RPC cache prewarm worker exited', () => ({
            data: {
              code,
              signal,
              durationMs: Date.now() - startedAt,
              execution: 'worker',
            },
          }))
        }
      }

      finalizeWorker()
    })

    prewarmWorkerProcess.unref()
  } catch (error) {
    getDebugLogger().warn('Failed to spawn Renoun prewarm worker', () => ({
      data: {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        execution: 'worker',
      },
    }))
    void runPrewarmInline(request.options, startedAt).finally(() => {
      finalizeActivePrewarmRequest(request.signature)
    })
  }
}

export function runPrewarmSafely(options?: {
  projectOptions?: ProjectOptions
}): void {
  const request: PrewarmRequest = {
    options,
    signature: getPrewarmRequestSignature(options),
  }

  if (queueOrSkipPrewarmRequest(request)) {
    return
  }

  startPrewarmRequest(request)
}
