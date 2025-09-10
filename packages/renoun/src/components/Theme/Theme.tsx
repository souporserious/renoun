import React from 'react'

import type { ConfigurationOptions } from '../Config/ConfigTypes.js'
import { ThemeContextProvider } from './ThemeContext.js'
import { ThemeScript } from './ThemeScript.js'
import { ThemeStyles } from './ThemeStyles.js'

/**
 * A provider that sets the theme colors for the entire application.
 * @internal
 */
export function ThemeProvider({
  children,
  theme,
  includeScript = true,
  nonce,
}: {
  children: React.ReactNode
  theme: ConfigurationOptions['theme']
  includeScript?: boolean
  nonce?: string
}) {
  return (
    <>
      {includeScript ? <ThemeScript nonce={nonce} /> : null}
      <ThemeStyles theme={theme} />
      <ThemeContextProvider value={theme}>{children}</ThemeContextProvider>
    </>
  )
}
