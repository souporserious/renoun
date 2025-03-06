import React from 'react'
import { GlobalStyles } from 'restyle'

import { getThemeColorVariables } from '../../utils/get-theme.js'
import { loadConfig } from '../../utils/load-config.js'
import { ThemeContextProvider } from './ThemeContext.js'

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

/** A component that sets the global theme colors. */
export async function ThemeStyles() {
  const colorVariables = await getThemeColorVariables()
  return <GlobalStyles>{colorVariables}</GlobalStyles>
}

const themeScriptSource = `
(function() {
    try {
        var storedColorMode = localStorage.getItem('colorMode');
        if (storedColorMode === 'light' || storedColorMode === 'dark') {
            document.documentElement.dataset.theme = storedColorMode;
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.dataset.theme = 'dark';
        } else {
            document.documentElement.dataset.theme = 'light';
        }
    } catch {
        // no-op
    }
})();
`

/** A script that sets the theme based on local storage immediately before the page renders. */
export function ThemeScripts() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />
}
