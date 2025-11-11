import React from 'react'

import { getDebugLogger } from '../../utils/debug.js'
import { defaultConfig } from './default-config.js'
import type { ConfigurationOptions } from './types.js'

interface DeferredValue<ValueType> {
  hasSettled: boolean
  currentValue?: ValueType
  promise: Promise<ValueType>
  resolve: (resolvedValue: ValueType) => void
  reject: (error: unknown) => void
  version?: string
}

function createDeferredValue<ValueType>(): DeferredValue<ValueType> {
  let deferredResolve!: (resolvedValue: ValueType) => void
  let deferredReject!: (error: unknown) => void

  const sharedPromise = new Promise<ValueType>((resolve, reject) => {
    deferredResolve = resolve
    deferredReject = reject
  })

  return {
    hasSettled: false,
    promise: sharedPromise,
    resolve: deferredResolve,
    reject: deferredReject,
  }
}

const GLOBAL_CONFIGURATION_SYMBOL_KEY = Symbol.for('__RENOUN_CONFIGURATION__')
const GLOBAL_PROVIDER_PRESENCE_SYMBOL_KEY = Symbol.for(
  '__RENOUN_HAS_PROVIDER__'
)

type GlobalObjectWithSymbols = typeof globalThis & {
  [GLOBAL_CONFIGURATION_SYMBOL_KEY]?: DeferredValue<ConfigurationOptions>
  [GLOBAL_PROVIDER_PRESENCE_SYMBOL_KEY]?: { isPresent: boolean }
}

/** Accessor for the single process/worker-local deferred configuration. */
function getOrCreateDeferredConfiguration(): DeferredValue<ConfigurationOptions> {
  const globalObject = globalThis as GlobalObjectWithSymbols
  if (!globalObject[GLOBAL_CONFIGURATION_SYMBOL_KEY]) {
    globalObject[GLOBAL_CONFIGURATION_SYMBOL_KEY] =
      createDeferredValue<ConfigurationOptions>()
  }
  return globalObject[GLOBAL_CONFIGURATION_SYMBOL_KEY]!
}

/** Presence flag so `getConfig` can immediately fall back to defaults when no provider is mounted. */
function getOrCreateProviderPresence(): { isPresent: boolean } {
  const globalObject = globalThis as GlobalObjectWithSymbols
  if (!globalObject[GLOBAL_PROVIDER_PRESENCE_SYMBOL_KEY]) {
    globalObject[GLOBAL_PROVIDER_PRESENCE_SYMBOL_KEY] = { isPresent: false }
  }
  return globalObject[GLOBAL_PROVIDER_PRESENCE_SYMBOL_KEY]!
}

/**
 * Reads the current configuration.
 * - If no provider is mounted, returns defaultConfig immediately.
 * - Otherwise waits for the provider to resolve (with a timeout).
 * @internal
 */
export async function getConfig(options?: {
  timeoutMs?: number
}): Promise<ConfigurationOptions> {
  const providerPresence = getOrCreateProviderPresence()
  if (!providerPresence.isPresent) {
    return defaultConfig
  }

  const deferredConfiguration = getOrCreateDeferredConfiguration()
  if (deferredConfiguration.hasSettled) {
    return deferredConfiguration.currentValue!
  }

  const timeoutMs = options?.timeoutMs ?? 8000
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            '[renoun] getConfig() timed out: ServerConfigContext did not resolve a configuration value'
          )
        )
      }, timeoutMs)
    })

    return await Promise.race([deferredConfiguration.promise, timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Initializes and caches the configuration.
 * - Accepts a static value or a `Promise<ConfigurationOptions>`.
 * - Optional `version` lets you force a refresh across HMR/redeploys.
 * @internal
 */
export function ServerConfigContext(props: {
  /** The configuration value to use. */
  value?: ConfigurationOptions | Promise<ConfigurationOptions>

  /** Optional version string to force reset the config cache. */
  version?: string

  /** The element tree to render. */
  children: React.ReactNode
}) {
  const { value = defaultConfig, version, children } = props

  const providerPresence = getOrCreateProviderPresence()
  providerPresence.isPresent = true

  const isDevelopmentEnvironment = process.env.NODE_ENV !== 'production'
  let deferredConfiguration = getOrCreateDeferredConfiguration()

  /** Decide whether we should reset the deferred container. */
  const shouldResetDeferred =
    (version !== undefined && deferredConfiguration.version !== version) ||
    // In dev, allow re-initialization to play nicely with HMR before the first settle:
    (isDevelopmentEnvironment && !deferredConfiguration.hasSettled)

  if (shouldResetDeferred) {
    ;(globalThis as GlobalObjectWithSymbols)[GLOBAL_CONFIGURATION_SYMBOL_KEY] =
      createDeferredValue<ConfigurationOptions>()
    deferredConfiguration = getOrCreateDeferredConfiguration()
    deferredConfiguration.version = version
  }

  /** Resolve only once, subsequent updates replace the cached value without touching the settled promise. */
  const resolveConfigurationOnce = (
    nextConfiguration: ConfigurationOptions
  ) => {
    if (!deferredConfiguration.hasSettled) {
      deferredConfiguration.hasSettled = true
      deferredConfiguration.currentValue = nextConfiguration
      deferredConfiguration.resolve(nextConfiguration)
    } else {
      // Already settled: refresh the cached value for future synchronous reads.
      deferredConfiguration.currentValue = nextConfiguration
    }
  }

  /** Reject only if the deferred has not yet settled and avoid throwing on a settled promise. */
  const rejectConfigurationOnce = (error: unknown) => {
    if (!deferredConfiguration.hasSettled) {
      deferredConfiguration.reject(error)
    } else {
      getDebugLogger().error('Late configuration error', () => ({
        operation: 'ServerConfigContext.rejectConfigurationOnce',
        data: { error },
      }))
    }
  }

  if (value && typeof (value as any).then === 'function') {
    ;(value as Promise<ConfigurationOptions>)
      .then(resolveConfigurationOnce)
      .catch(rejectConfigurationOnce)
  } else {
    resolveConfigurationOnce(value as ConfigurationOptions)
  }

  return children
}
