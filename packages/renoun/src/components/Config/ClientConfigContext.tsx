'use client'
import React from 'react'

import type { ConfigurationOptions } from './types.js'

/**
 * A context that provides the current configured client configuration.
 * @internal
 */
export const ClientConfigContext =
  React.createContext<ConfigurationOptions | null>(null)

/**
 * A provider that captures the client configuration and provides it to the client.
 * @internal
 */
export function ClientConfigProvider({
  value,
  children,
}: {
  value: ConfigurationOptions
  children: React.ReactNode
}) {
  return (
    <ClientConfigContext.Provider value={value}>
      {children}
    </ClientConfigContext.Provider>
  )
}

/**
 * Get the current configured client configuration.
 * @internal
 */
export function useConfig(): ConfigurationOptions {
  const config = React.useContext(ClientConfigContext)
  if (!config) {
    throw new Error(
      '[renoun] The `RootProvider` component must be used to provide a configuration to the `useConfig` hook.'
    )
  }
  return config
}
