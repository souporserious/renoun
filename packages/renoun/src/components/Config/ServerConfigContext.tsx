import React, { cache } from 'react'

import type { ConfigurationOptions } from './ConfigTypes.js'
import { defaultConfig } from './ConfigTypes.js'

const CACHE_KEY = Symbol.for('__RENOUN_CONFIG__')
const configCache = cache(() => ({ current: defaultConfig }))

export function getConfig(): ConfigurationOptions {
  if (process.env.NODE_ENV === 'development') {
    return (globalThis as any)[CACHE_KEY]!
  }
  return configCache().current
}

export function ServerConfigContext({
  value,
  children,
}: {
  value: ConfigurationOptions
  children: React.ReactNode
}) {
  const nextValue: ConfigurationOptions =
    typeof value.theme === 'string'
      ? { ...value, theme: { light: value.theme, dark: value.theme } }
      : value
  if (process.env.NODE_ENV === 'development') {
    ;(globalThis as any)[CACHE_KEY] = nextValue
  }
  configCache().current = nextValue
  return children
}
