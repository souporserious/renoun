import React from 'react'

import { defaultConfig } from './default-config.js'
import type { ConfigurationOptions } from './types.js'

type Deferred<T> = {
  settled: boolean
  value?: T
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  version?: string
}

function createDeferred<Type>(): Deferred<Type> {
  let resolve!: (value: Type) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Type>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { settled: false, promise, resolve, reject }
}

const GLOBAL_KEY = Symbol.for('__RENOUN_CONFIG__')
const GLOBAL_PRESENCE_KEY = Symbol.for('__RENOUN_HAS_PROVIDER__')

function getDeferred(): Deferred<ConfigurationOptions> {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    ;(globalThis as any)[GLOBAL_KEY] = createDeferred<ConfigurationOptions>()
  }
  return (globalThis as any)[GLOBAL_KEY]
}

interface Presence {
  present: boolean
}

function getPresence(): Presence {
  if (!(globalThis as any)[GLOBAL_PRESENCE_KEY]) {
    ;(globalThis as any)[GLOBAL_PRESENCE_KEY] = { present: false } as Presence
  }
  return (globalThis as any)[GLOBAL_PRESENCE_KEY]
}

/**
 * Get the current configuration set in the `RootProvider` component.
 * @internal
 */
export async function getConfig(options?: {
  timeoutMs?: number
}): Promise<ConfigurationOptions> {
  const presence = getPresence()
  // If no provider is present in the tree, fall back to the default config immediately
  if (!presence.present) {
    return defaultConfig
  }
  const deferredValue = getDeferred()
  if (deferredValue.settled) {
    return deferredValue.value!
  }
  const { timeoutMs = 8000 } = options ?? {}
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      reject(
        new Error(
          '[renoun] getConfig() timed out: ServerConfigContext did not resolve'
        )
      )
    }, timeoutMs)
  )
  return Promise.race([deferredValue.promise, timeout])
}

/** A provider that captures the server configuration and provides it to the server.
 * @internal
 */
export function ServerConfigContext({
  value = defaultConfig,
  version,
  children,
}: {
  /** The configuration options to provide. */
  value?: ConfigurationOptions | Promise<ConfigurationOptions>

  /** Optional version string to force reset the config cache. */
  version?: string

  /** The element tree to render. */
  children: React.ReactNode
}) {
  const presence = getPresence()
  presence.present = true

  let deferredValue = getDeferred()

  // If the version changed, reset the deferred value
  if (version !== undefined && deferredValue.version !== version) {
    ;(globalThis as any)[GLOBAL_KEY] = createDeferred<ConfigurationOptions>()
    deferredValue = getDeferred()
    deferredValue.version = version
  }

  if (!deferredValue.settled) {
    if (value && typeof (value as any).then === 'function') {
      // resolve when the promise settles for async config
      ;(value as Promise<ConfigurationOptions>)
        .then((resolved) => {
          deferredValue.settled = true
          deferredValue.value = resolved
          deferredValue.resolve(resolved)
        })
        .catch((error) => {
          // Surface legitimate errors by rejecting the deferred
          deferredValue.reject(error)
        })
    } else {
      // Sync config
      deferredValue.settled = true
      deferredValue.value = value as ConfigurationOptions
      deferredValue.resolve(value as ConfigurationOptions)
    }
  } else {
    // Subsequent renders update the cached value
    if (value && typeof (value as any).then === 'function') {
      ;(value as Promise<ConfigurationOptions>)
        .then((resolved) => {
          deferredValue.value = resolved
        })
        .catch((error) => {
          // Surface errors to any awaiting callers
          deferredValue.reject(error)
        })
    } else {
      deferredValue.value = value as ConfigurationOptions
    }
  }

  return children
}
