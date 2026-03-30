import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AnalysisOptions } from '../analysis/types.ts'
import type { AnalysisRpcRequestPriority } from '../analysis/request-priority.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { isVitestRuntime } from '../utils/env.ts'
import {
  BUILD_PREWARM_REQUEST_TIMEOUT_MS,
  PREWARM_REQUEST_TIMEOUT_MS,
  PREWARM_WORKER_PAYLOAD_ENV_KEY,
} from './prewarm/constants.ts'

const PREWARM_FORCE_WORKER_ENV_KEY = 'RENOUN_PREWARM_FORCE_WORKER'

interface PrewarmWorkerMessage {
  type?: unknown
  durationMs?: unknown
  error?: unknown
  priority?: unknown
}

type PrewarmCompletionPhase = 'ready' | 'settled'

export interface StartedPrewarmHandle {
  ready: Promise<void>
  settled: Promise<void>
}

interface PrewarmRequest extends StartedPrewarmHandle {
  id: number
  allowInlineFallback: boolean
  inlineFallbackCompletionPhase: PrewarmCompletionPhase
  timeoutMs: number
  options?: {
    analysisOptions?: AnalysisOptions
    requestPriority?: AnalysisRpcRequestPriority
  }
  resolveReady: () => void
  resolveSettled: () => void
  signature: string
}

interface RunPrewarmSafelyExecutionOptions {
  allowInlineFallback?: boolean
  inlineFallbackCompletionPhase?: PrewarmCompletionPhase
  requestPriority?: AnalysisRpcRequestPriority
  timeoutMs?: number
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
  requestPriority?: AnalysisRpcRequestPriority
}, executionOptions?: RunPrewarmSafelyExecutionOptions): string {
  try {
    return (
      JSON.stringify({
        allowInlineFallback: executionOptions?.allowInlineFallback ?? true,
        inlineFallbackCompletionPhase:
          executionOptions?.inlineFallbackCompletionPhase ?? 'ready',
        requestPriority: executionOptions?.requestPriority ?? null,
        timeoutMs: executionOptions?.timeoutMs ?? null,
        options: options ?? null,
      }) ?? 'null'
    )
  } catch {
    return options?.analysisOptions?.tsConfigFilePath ?? 'unknown'
  }
}

function shouldUsePrewarmWorker(): boolean {
  return (
    process.env[PREWARM_FORCE_WORKER_ENV_KEY] === '1' || !isVitestRuntime()
  )
}

async function runPrewarmInline(
  options?: {
    analysisOptions?: AnalysisOptions
    requestPriority?: AnalysisRpcRequestPriority
  },
  startedAt = Date.now(),
  completionPhase: PrewarmCompletionPhase = 'settled'
): Promise<void> {
  try {
    const { prewarmRenounRpcServerCache, startPrewarmRenounRpcServerCache } =
      await import('./prewarm.ts')

    if (completionPhase === 'ready') {
      await startPrewarmRenounRpcServerCache({
        ...options,
        startSettledInBackground: false,
      }).ready
    } else {
      await prewarmRenounRpcServerCache(options)
    }

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

function createPrewarmRequest(
  options?: {
    analysisOptions?: AnalysisOptions
    requestPriority?: AnalysisRpcRequestPriority
  },
  executionOptions?: RunPrewarmSafelyExecutionOptions
): PrewarmRequest {
  let resolveReadyPromise!: () => void
  let resolveSettledPromise!: () => void
  const readyPromise = new Promise<void>((resolve) => {
    resolveReadyPromise = resolve
  })
  const settledPromise = new Promise<void>((resolve) => {
    resolveSettledPromise = resolve
  })

  return {
    id: ++nextPrewarmRequestId,
    allowInlineFallback: executionOptions?.allowInlineFallback ?? true,
    inlineFallbackCompletionPhase:
      executionOptions?.inlineFallbackCompletionPhase ?? 'ready',
    timeoutMs: executionOptions?.timeoutMs ?? PREWARM_REQUEST_TIMEOUT_MS,
    options: {
      ...options,
      requestPriority:
        executionOptions?.requestPriority ?? options?.requestPriority,
    },
    ready: readyPromise,
    settled: settledPromise,
    resolveReady: resolveReadyPromise,
    resolveSettled: () => {
      resolveReadyPromise()
      resolveSettledPromise()
    },
    signature: getPrewarmRequestSignature(options, executionOptions),
  }
}

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

function queueOrSkipPrewarmRequest(
  request: PrewarmRequest
): StartedPrewarmHandle | false {
  if (!activePrewarmRequest) {
    return false
  }

  if (activePrewarmRequest.signature === request.signature) {
    getDebugLogger().debug(
      'Skipping prewarm request because matching prewarm is already running'
    )
    return activePrewarmRequest
  }

  if (pendingPrewarmRequest?.signature === request.signature) {
    getDebugLogger().debug(
      'Skipping prewarm request because matching prewarm is already queued'
    )
    return pendingPrewarmRequest
  }

  const replacedPendingRequest = pendingPrewarmRequest !== undefined
  pendingPrewarmRequest?.resolveSettled()
  pendingPrewarmRequest = request
  getDebugLogger().info('Queued Renoun RPC cache prewarm request', () => ({
    data: {
      status: 'queued',
      replacedPendingRequest,
    },
  }))
  return request
}

function startPrewarmRequest(request: PrewarmRequest): void {
  const startedAt = Date.now()
  activePrewarmRequest = request

  getDebugLogger().info('Renoun RPC cache prewarm started', () => ({
    data: { status: 'running' },
  }))

  let didResolveReady = false
  let didHandleTerminalMessage = false
  let didFinalize = false
  let didStartInlineFallback = false
  let isAwaitingInlineFallbackCompletion = false
  let prewarmWorkerProcess: ReturnType<typeof spawn> | undefined
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const clearRequestTimeout = () => {
    if (!timeoutHandle) {
      return
    }

    clearTimeout(timeoutHandle)
    timeoutHandle = undefined
  }

  const resolveReady = () => {
    if (didResolveReady) {
      return
    }

    didResolveReady = true
    request.resolveReady()
  }

  const finalizeRequest = () => {
    if (didFinalize) {
      return
    }

    didFinalize = true
    clearRequestTimeout()
    request.resolveSettled()
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
    isAwaitingInlineFallbackCompletion = true
    scheduleRequestTimeout('inline')
    void runPrewarmInline(
      request.options,
      startedAt,
      request.inlineFallbackCompletionPhase
    ).finally(() => {
      isAwaitingInlineFallbackCompletion = false
      resolveReady()
      finalizeRequest()
    })
  }

  const scheduleRequestTimeout = (execution: 'inline' | 'worker') => {
    clearRequestTimeout()
    timeoutHandle = setTimeout(() => {
      getDebugLogger().warn('Renoun RPC cache prewarm timed out', () => ({
        data: {
          durationMs: Date.now() - startedAt,
          timeoutMs: request.timeoutMs,
          execution,
        },
      }))

      if (execution === 'worker' && !didHandleTerminalMessage) {
        didHandleTerminalMessage = true
        isAwaitingInlineFallbackCompletion =
          !didResolveReady && request.allowInlineFallback

        if (prewarmWorkerProcess && !prewarmWorkerProcess.killed) {
          prewarmWorkerProcess.kill('SIGKILL')
        }

        if (didResolveReady) {
          finalizeRequest()
          return
        }

        runInlineFallback()
        return
      }

      finalizeRequest()
    }, request.timeoutMs)
    timeoutHandle.unref()
  }

  const workerLaunchConfig = resolvePrewarmWorkerLaunchConfig()
  if (!shouldUsePrewarmWorker() || !workerLaunchConfig) {
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
            requestPriority: request.options?.requestPriority,
          }),
        },
      }
    )
    scheduleRequestTimeout('worker')
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

      if (message.type === 'ready') {
        resolveReady()
        getDebugLogger().debug('Renoun prewarm worker reached ready state', () => ({
          data: {
            durationMs: parsePrewarmWorkerDurationMs(
              message,
              fallbackDurationMs
            ),
            execution: 'worker',
          },
        }))
        return
      }

      if (message.type === 'completed') {
        didHandleTerminalMessage = true
        resolveReady()
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
        if (didHandleTerminalMessage) {
          return
        }

        didHandleTerminalMessage = true
        if (didResolveReady) {
          getDebugLogger().warn(
            'Renoun RPC cache prewarm settled after ready with an error',
            () => ({
              data: {
                error: parsePrewarmWorkerErrorMessage(message),
                durationMs: parsePrewarmWorkerDurationMs(
                  message,
                  fallbackDurationMs
                ),
                execution: 'worker',
              },
            })
          )
          return
        }

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
        runInlineFallback()
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

      if (didResolveReady) {
        finalizeRequest()
        return
      }

      runInlineFallback()
    })

    prewarmWorkerProcess.once('exit', (code, signal) => {
      if (!didHandleTerminalMessage) {
        if ((code ?? 0) === 0 && signal === null) {
          resolveReady()
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

          if (didResolveReady) {
            finalizeRequest()
            return
          }

          runInlineFallback()
          return
        }
      }

      if (isAwaitingInlineFallbackCompletion) {
        return
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

export function startPrewarmSafely(
  options?: {
    analysisOptions?: AnalysisOptions
    requestPriority?: AnalysisRpcRequestPriority
  },
  executionOptions?: RunPrewarmSafelyExecutionOptions
): StartedPrewarmHandle {
  const request = createPrewarmRequest(options, executionOptions)
  const queuedHandle = queueOrSkipPrewarmRequest(request)

  if (queuedHandle) {
    return queuedHandle
  }

  startPrewarmRequest(request)
  return request
}

export function runPrewarmSafely(
  options?: {
    analysisOptions?: AnalysisOptions
    requestPriority?: AnalysisRpcRequestPriority
  },
  executionOptions?: RunPrewarmSafelyExecutionOptions
): Promise<void> {
  return startPrewarmSafely(options, {
    ...executionOptions,
    inlineFallbackCompletionPhase: 'settled',
  }).settled
}

export { BUILD_PREWARM_REQUEST_TIMEOUT_MS }
