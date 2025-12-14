import React from 'react'

import type { ConfigurationOptions } from '../Config/types.ts'
import { ThemeContextProvider } from './ThemeContext.tsx'
import { ThemeStyles } from './ThemeStyles.ts'

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
