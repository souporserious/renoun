'use client'
import React from 'react'
import type { ConfigurationOptions } from './ConfigTypes.js'

export const ClientConfigReactContext =
  React.createContext<ConfigurationOptions | null>(null)

export function ClientConfigProvider({
  value,
  children,
}: {
  value: ConfigurationOptions
  children: React.ReactNode
}) {
  return (
    <ClientConfigReactContext.Provider value={value}>
      {children}
    </ClientConfigReactContext.Provider>
  )
}

export function useClientConfig(): ConfigurationOptions {
  const config = React.useContext(ClientConfigReactContext)
  if (!config) {
    throw new Error(
      '[renoun] The `RootProvider` component must be used to provide a configuration to the `useClientConfig` hook.'
    )
  }
  return config
}
