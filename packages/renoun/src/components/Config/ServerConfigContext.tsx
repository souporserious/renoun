import React, { cache } from 'react'

import { defaultConfig } from './default-config.js'
import type { ConfigurationOptions } from './types.js'

type Deferred<T> = {
  settled: boolean
  value?: T
  promise: Promise<T>
  resolve: (v: T) => void
  version?: string
}

function createDeferred<Type>(): Deferred<Type> {
  let resolve!: (value: Type) => void
  const promise = new Promise<Type>((r) => (resolve = r))
  return { settled: false, promise, resolve }
}

const GLOBAL_KEY = Symbol.for('__RENOUN_CONFIG__')

function getGlobalDeferred(): Deferred<ConfigurationOptions> {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    ;(globalThis as any)[GLOBAL_KEY] = createDeferred<ConfigurationOptions>()
  }
  return (globalThis as any)[GLOBAL_KEY]
}

const getRequestDeferred = cache(() => createDeferred<ConfigurationOptions>())

function getDeferred(): Deferred<ConfigurationOptions> {
  if (process.env.NODE_ENV === 'development') {
    return getGlobalDeferred()
  }
  return getRequestDeferred()
}

/**
 * Get the current configuration set in the `RootProvider` component.
 * @internal
 */
export async function getConfig(options?: {
  timeoutMs?: number
}): Promise<ConfigurationOptions> {
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
  value?: ConfigurationOptions

  /** Optional version string to force reset the config cache. */
  version?: string

  /** The element tree to render. */
  children: React.ReactNode
}) {
  let deferredValue = getDeferred()

  // If the version changed, reset the deferred value
  if (version !== undefined && deferredValue.version !== version) {
    if (process.env.NODE_ENV === 'development') {
      ;(globalThis as any)[GLOBAL_KEY] = createDeferred<ConfigurationOptions>()
      deferredValue = getDeferred()
    } else {
      deferredValue = getDeferred()
    }
    deferredValue.version = version
  }

  if (!deferredValue.settled) {
    deferredValue.settled = true
    deferredValue.value = value
    deferredValue.resolve(value)
  } else {
    deferredValue.value = value
  }

  return children
}
