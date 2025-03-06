import React from 'react'

import { loadConfig } from '../../utils/load-config.js'
import { ThemeContextProvider } from './ThemeContext.js'
import { ThemeScripts } from './ThemeScripts.js'
import { ThemeStyles } from './ThemeStyles.js'

/** A provider that sets the theme colors for the entire application. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const config = loadConfig()
  return (
    <>
      <ThemeStyles />
      <ThemeScripts />
      <ThemeContextProvider value={config.theme}>
        {children}
      </ThemeContextProvider>
    </>
  )
}
