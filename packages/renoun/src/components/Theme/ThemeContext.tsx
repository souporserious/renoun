'use client'
import React, { createContext } from 'react'

import type { ConfigurationOptions } from '../../utils/load-config.js'

export const ThemeContext = createContext<ConfigurationOptions['theme'] | null>(
  null
)

export function ThemeContextProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: ConfigurationOptions['theme']
}) {
  return <ThemeContext value={value}>{children}</ThemeContext>
}
