import {
  getAnalysisClientBrowserRuntime as getSharedAnalysisClientBrowserRuntime,
  getAnalysisServerRuntimeKey,
  normalizeAnalysisServerRuntime,
} from './browser-runtime.ts'
import type { AnalysisServerRuntime } from './runtime-env.ts'

const browserRuntimeRegistrations: Array<{
  token: symbol
  runtime: AnalysisServerRuntime
}> = []
const browserRuntimeRetentionListeners = new Set<
  (hasRetainedBrowserRuntime: boolean) => void
>()

let explicitBrowserRuntime: AnalysisServerRuntime | undefined
let retainedBrowserRuntimeKeyAtActivation: string | undefined

function getResolvedAnalysisClientBrowserRuntime():
  | AnalysisServerRuntime
  | undefined {
  return (
    browserRuntimeRegistrations[browserRuntimeRegistrations.length - 1]
      ?.runtime ?? explicitBrowserRuntime
  )
}

function notifyAnalysisClientBrowserRuntimeRetentionChangeIfNeeded(
  previousHasRetainedBrowserRuntime: boolean
): void {
  const nextHasRetainedBrowserRuntime =
    hasRetainedAnalysisClientBrowserRuntime()
  if (nextHasRetainedBrowserRuntime === previousHasRetainedBrowserRuntime) {
    return
  }

  for (const listener of browserRuntimeRetentionListeners) {
    listener(nextHasRetainedBrowserRuntime)
  }
}

export function onAnalysisClientBrowserRuntimeRetentionChange(
  listener: (hasRetainedBrowserRuntime: boolean) => void
): () => void {
  browserRuntimeRetentionListeners.add(listener)
  return () => {
    browserRuntimeRetentionListeners.delete(listener)
  }
}

export function getAnalysisClientRetainedBrowserRuntimeActivationKey():
  | string
  | undefined {
  return retainedBrowserRuntimeKeyAtActivation
}

export function setRequestedAnalysisClientBrowserRuntime(
  runtime: AnalysisServerRuntime | undefined,
  applyRuntime: (runtime?: AnalysisServerRuntime) => void
): void {
  explicitBrowserRuntime = normalizeAnalysisServerRuntime(runtime)
  applyRuntime(getResolvedAnalysisClientBrowserRuntime())
}

export function retainRequestedAnalysisClientBrowserRuntime(
  runtime: AnalysisServerRuntime | undefined,
  applyRuntime: (runtime?: AnalysisServerRuntime) => void,
  options: {
    preferCurrentRuntime?: boolean
  } = {}
): () => void {
  const didHaveRetainedBrowserRuntime =
    hasRetainedAnalysisClientBrowserRuntime()
  const normalizedRuntime = normalizeAnalysisServerRuntime(
    options.preferCurrentRuntime === true
      ? (getSharedAnalysisClientBrowserRuntime() ?? runtime)
      : runtime
  )
  if (!normalizedRuntime) {
    return () => {}
  }

  const token = Symbol('analysis-client-browser-runtime')
  browserRuntimeRegistrations.push({
    token,
    runtime: normalizedRuntime,
  })
  if (!didHaveRetainedBrowserRuntime) {
    retainedBrowserRuntimeKeyAtActivation =
      getAnalysisServerRuntimeKey(normalizedRuntime)
  }
  applyRuntime(getResolvedAnalysisClientBrowserRuntime())
  notifyAnalysisClientBrowserRuntimeRetentionChangeIfNeeded(
    didHaveRetainedBrowserRuntime
  )

  return () => {
    const registrationIndex = browserRuntimeRegistrations.findIndex(
      (registration) => registration.token === token
    )
    if (registrationIndex === -1) {
      return
    }

    const didHaveRetainedBrowserRuntime =
      hasRetainedAnalysisClientBrowserRuntime()
    browserRuntimeRegistrations.splice(registrationIndex, 1)
    if (browserRuntimeRegistrations.length === 0) {
      retainedBrowserRuntimeKeyAtActivation = undefined
    }
    applyRuntime(getResolvedAnalysisClientBrowserRuntime())
    notifyAnalysisClientBrowserRuntimeRetentionChangeIfNeeded(
      didHaveRetainedBrowserRuntime
    )
  }
}

export function hasRetainedAnalysisClientBrowserRuntime(): boolean {
  return browserRuntimeRegistrations.length > 0
}

export function resetRequestedAnalysisClientBrowserRuntimeState(): void {
  explicitBrowserRuntime = undefined
  browserRuntimeRegistrations.length = 0
  retainedBrowserRuntimeKeyAtActivation = undefined
  browserRuntimeRetentionListeners.clear()
}
