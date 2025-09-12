import React, { cache } from 'react'

import { defaultConfig } from './default-config.js'
import type { ConfigurationOptions } from './types.js'

const CACHE_KEY = Symbol.for('__RENOUN_CONFIG__')
const configCache = cache(() => ({ current: defaultConfig }))

/**
 * Get the current configured server configuration.
 * @internal
 */
export function getConfig(): ConfigurationOptions {
  if (process.env.NODE_ENV === 'development') {
    return (globalThis as any)[CACHE_KEY]!
  }
  return configCache().current
}

/**
 * A context that provides the current configured server configuration.
 * @internal
 */
export function ServerConfigContext({
  value,
  children,
}: {
  value: ConfigurationOptions
  children: React.ReactNode
}) {
  if (process.env.NODE_ENV === 'development') {
    ;(globalThis as any)[CACHE_KEY] = value
  } else {
    configCache().current = value
  }
  return children
}
