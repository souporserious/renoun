'use client'
import React, { createContext } from 'react'

import type { ConfigurationOptions } from '../../utils/load-config.js'

/**
 * A context that provides the theme colors.
 * @internal
 */
export const ThemeContext = createContext<ConfigurationOptions['theme'] | null>(
  null
)

/**
 * A provider that sets the theme colors for the entire tree.
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
