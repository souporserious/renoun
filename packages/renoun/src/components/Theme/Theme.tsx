import React from 'react'

import type { ConfigurationOptions } from '../Config/types.js'
import { ThemeContextProvider } from './ThemeContext.js'
import { ThemeStyles } from './ThemeStyles.js'

/**
 * A provider that sets the theme colors for the entire application.
 * @internal
 */
export function ThemeProvider({
  children,
  theme,
}: {
  children: React.ReactNode
  theme: ConfigurationOptions['theme']
}) {
  return (
    <>
      <ThemeStyles theme={theme} />
      <ThemeContextProvider value={theme}>{children}</ThemeContextProvider>
    </>
  )
}
