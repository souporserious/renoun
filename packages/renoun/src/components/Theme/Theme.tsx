import React from 'react'

import { loadConfig } from '../../utils/load-config.js'
import { ThemeContextProvider } from './ThemeContext.js'
import { ThemeStyles } from './ThemeStyles.js'

/** A provider that sets the theme colors for the entire application. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const config = loadConfig()
  return (
    <>
      <ThemeScripts />
      <ThemeStyles />
      <ThemeContextProvider value={config.theme}>
        {children}
      </ThemeContextProvider>
    </>
  )
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
function ThemeScripts() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />
}
