'use client'
import React, { createContext } from 'react'

import type { ConfigurationOptions } from '../Config/types.ts'

/**
 * A context that provides the current configured themes.
 * @internal
 */
export const ThemeContext = createContext<ConfigurationOptions['theme'] | null>(
  null
)

/**
 * A provider that captures the server theme configuration and provides it to the client.
 * @internal
 */
export function ThemeContextProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: ConfigurationOptions['theme']
}) {
  return <ThemeContext value={value}>{children}</ThemeContext>
}
