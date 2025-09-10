'use client'
import React from 'react'
import type { ConfigurationOptions } from './ConfigTypes.js'

export const ClientConfigContext =
  React.createContext<ConfigurationOptions | null>(null)

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

export function useConfig(): ConfigurationOptions {
  const config = React.useContext(ClientConfigContext)
  if (!config) {
    throw new Error(
      '[renoun] The `RootProvider` component must be used to provide a configuration to the `useConfig` hook.'
    )
  }
  return config
}
