import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AnalysisOptions } from '../analysis/types.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { isVitestRuntime } from '../utils/env.ts'
import {
  PREWARM_REQUEST_TIMEOUT_MS,
  PREWARM_WORKER_PAYLOAD_ENV_KEY,
} from './prewarm/constants.ts'

interface PrewarmWorkerMessage {
  type?: unknown
  durationMs?: unknown
  error?: unknown
  priority?: unknown
}

interface PrewarmRequest {
  id: number
  allowInlineFallback: boolean
  options?: { analysisOptions?: AnalysisOptions }
  signature: string
}

interface RunPrewarmSafelyExecutionOptions {
  allowInlineFallback?: boolean
}

type PrewarmWorkerExecArgvResolverOptions = {
  execArgv?: readonly string[]
}

type PrewarmWorkerLaunchConfigResolverOptions =
  PrewarmWorkerExecArgvResolverOptions & {
    exists?: (path: string) => boolean
    processFeatures?: {
      typescript?: unknown
    }
  }

export function createDefaultPrewarmOptions(rootPath = process.cwd()): {
  analysisOptions: Pick<AnalysisOptions, 'tsConfigFilePath'>
} {
  return {
    analysisOptions: {
      tsConfigFilePath: join(rootPath, 'tsconfig.json'),
    },
  }
}

function resolvePrewarmWorkerExecArgv({
  execArgv = process.execArgv,
}: PrewarmWorkerExecArgvResolverOptions = {}): string[] {
  const resolvedExecArgv: string[] = []

  for (let index = 0; index < execArgv.length; ++index) {
    const argument = execArgv[index]

    if (
      argument === '--loader' ||
      argument === '--experimental-loader' ||
      argument === '--import'
    ) {
      resolvedExecArgv.push(argument)

      const nextArgument = execArgv[index + 1]
      if (nextArgument !== undefined) {
        resolvedExecArgv.push(nextArgument)
        ++index
      }
      continue
    }

    if (
      argument.startsWith('--loader=') ||
      argument.startsWith('--experimental-loader=') ||
      argument.startsWith('--import=') ||
      argument === '--experimental-strip-types' ||
      argument.startsWith('--experimental-strip-types=')
    ) {
      resolvedExecArgv.push(argument)
    }
  }

  return resolvedExecArgv
}

export function resolvePrewarmWorkerLaunchConfig({
  exists = existsSync,
  processFeatures = process.features,
  execArgv = process.execArgv,
}: PrewarmWorkerLaunchConfigResolverOptions = {}):
  | {
      entryFilePath: string
      execArgv: string[]
    }
  | undefined {
  const workerEntryFilePathCandidates = [
    fileURLToPath(new URL('./prewarm.worker.js', import.meta.url)),
    fileURLToPath(new URL('./prewarm.worker.ts', import.meta.url)),
  ]

  const javaScriptWorkerEntryFilePath = workerEntryFilePathCandidates[0]
  if (exists(javaScriptWorkerEntryFilePath)) {
    return {
      entryFilePath: javaScriptWorkerEntryFilePath,
      execArgv: [],
    }
  }

  const typeScriptWorkerEntryFilePath = workerEntryFilePathCandidates[1]
  if (!exists(typeScriptWorkerEntryFilePath)) {
    return undefined
  }

  const workerExecArgv = resolvePrewarmWorkerExecArgv({ execArgv })
  const canExecuteTypeScriptEntrypoints =
    typeof processFeatures.typescript === 'string'
      ? processFeatures.typescript.length > 0
      : workerExecArgv.length > 0

  if (!canExecuteTypeScriptEntrypoints) {
    return undefined
  }

  return {
    entryFilePath: typeScriptWorkerEntryFilePath,
    execArgv: workerExecArgv,
  }
}

export function resolvePrewarmWorkerEntryFilePath(
  options?: PrewarmWorkerLaunchConfigResolverOptions
): string | undefined {
  return resolvePrewarmWorkerLaunchConfig(options)?.entryFilePath
}

function getPrewarmRequestSignature(options?: {
  analysisOptions?: AnalysisOptions
}, executionOptions?: RunPrewarmSafelyExecutionOptions): string {
  try {
    return (
      JSON.stringify({
        allowInlineFallback: executionOptions?.allowInlineFallback ?? true,
        options: options ?? null,
      }) ?? 'null'
    )
  } catch {
    return options?.analysisOptions?.tsConfigFilePath ?? 'unknown'
  }
}

async function runPrewarmInline(
  options?: { analysisOptions?: AnalysisOptions },
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

function parsePrewarmWorkerPriority(
  message: PrewarmWorkerMessage
): number | undefined {
  return typeof message.priority === 'number' &&
    Number.isFinite(message.priority)
    ? message.priority
    : undefined
}

let activePrewarmRequest: PrewarmRequest | undefined
let pendingPrewarmRequest: PrewarmRequest | undefined
let nextPrewarmRequestId = 0

function finalizeActivePrewarmRequest(requestId: number): void {
  if (!activePrewarmRequest || activePrewarmRequest.id !== requestId) {
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

  const replacedPendingRequest = pendingPrewarmRequest !== undefined
  pendingPrewarmRequest = request
  getDebugLogger().info('Queued Renoun RPC cache prewarm request', () => ({
    data: {
      status: 'queued',
      replacedPendingRequest,
    },
  }))
  return true
}

function startPrewarmRequest(request: PrewarmRequest): void {
  const startedAt = Date.now()
  activePrewarmRequest = request

  getDebugLogger().info('Renoun RPC cache prewarm started', () => ({
    data: { status: 'running' },
  }))

  let didHandleTerminalMessage = false
  let didFinalize = false
  let didStartInlineFallback = false
  let prewarmWorkerProcess: ReturnType<typeof spawn> | undefined

  const finalizeRequest = () => {
    if (didFinalize) {
      return
    }

    didFinalize = true
    clearTimeout(timeoutHandle)
    finalizeActivePrewarmRequest(request.id)
  }

  const runInlineFallback = () => {
    if (didStartInlineFallback) {
      return
    }

    if (!request.allowInlineFallback) {
      getDebugLogger().debug(
        'Skipping inline Renoun RPC cache prewarm fallback'
      )
      finalizeRequest()
      return
    }

    didStartInlineFallback = true
    void runPrewarmInline(request.options, startedAt).finally(() => {
      finalizeRequest()
    })
  }

  const timeoutHandle = setTimeout(() => {
    didHandleTerminalMessage = true

    getDebugLogger().warn('Renoun RPC cache prewarm timed out', () => ({
      data: {
        durationMs: Date.now() - startedAt,
        timeoutMs: PREWARM_REQUEST_TIMEOUT_MS,
        execution: prewarmWorkerProcess ? 'worker' : 'inline',
      },
    }))

    if (prewarmWorkerProcess && !prewarmWorkerProcess.killed) {
      prewarmWorkerProcess.kill('SIGKILL')
    }

    finalizeRequest()
  }, PREWARM_REQUEST_TIMEOUT_MS)
  timeoutHandle.unref()

  const workerLaunchConfig = resolvePrewarmWorkerLaunchConfig()
  if (isVitestRuntime() || !workerLaunchConfig) {
    runInlineFallback()
    return
  }

  try {
    prewarmWorkerProcess = spawn(
      process.execPath,
      [...workerLaunchConfig.execArgv, workerLaunchConfig.entryFilePath],
      {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        shell: false,
        env: {
          ...process.env,
          [PREWARM_WORKER_PAYLOAD_ENV_KEY]: JSON.stringify({
            analysisOptions: request.options?.analysisOptions,
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
      runInlineFallback()
    })

    prewarmWorkerProcess.once('exit', (code, signal) => {
      if (!didHandleTerminalMessage) {
        if ((code ?? 0) === 0 && signal === null) {
          getDebugLogger().info('Renoun RPC cache prewarm completed', () => ({
            data: {
              status: 'finished',
              durationMs: Date.now() - startedAt,
              execution: 'worker',
            },
          }))
        } else {
          getDebugLogger().warn(
            'Renoun RPC cache prewarm worker exited',
            () => ({
              data: {
                code,
                signal,
                durationMs: Date.now() - startedAt,
                execution: 'worker',
              },
            })
          )
          runInlineFallback()
          return
        }
      }

      finalizeRequest()
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
    runInlineFallback()
  }
}

export function runPrewarmSafely(
  options?: { analysisOptions?: AnalysisOptions },
  executionOptions?: RunPrewarmSafelyExecutionOptions
): void {
  const request: PrewarmRequest = {
    id: ++nextPrewarmRequestId,
    allowInlineFallback: executionOptions?.allowInlineFallback ?? true,
    options,
    signature: getPrewarmRequestSignature(options, executionOptions),
  }

  if (queueOrSkipPrewarmRequest(request)) {
    return
  }

  startPrewarmRequest(request)
}
