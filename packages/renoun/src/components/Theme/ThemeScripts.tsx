import React from 'react'

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
