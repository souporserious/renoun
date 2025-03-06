'use client'
import { useEffect, useCallback, useState, use } from 'react'

import { ThemeContext } from './ThemeContext.js'

/** A hook that provides the current color mode and a function to set the color mode. */
export function useThemePicker(): [
  theme: string | undefined,
  setTheme: (theme?: string) => void,
] {
  const theme = use(ThemeContext)

  if (theme === null) {
    throw new Error(
      '[renoun] No theme configuration found. The `ThemeProvider` component must be used to provide a theme configuration to the `useThemePicker` hook.'
    )
  }

  if (typeof theme === 'string') {
    throw new Error(
      '[renoun] The theme configuration is invalid. The `theme` property must be an object that defines each color mode when using the `useThemePicker` hook.'
    )
  }

  const themeModes = Object.keys(theme)
  const [colorMode, setColorMode] = useState<string | undefined>()

  useEffect(() => {
    const controller = new AbortController()

    if (colorMode === undefined) {
      try {
        const storedColorMode = localStorage.getItem('colorMode')
        if (storedColorMode && themeModes.includes(storedColorMode)) {
          document.documentElement.dataset.theme = storedColorMode
          setColorMode(storedColorMode)
        }
      } catch {
        // no-op if localStorage access fails
      }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener(
      'change',
      (event) => {
        try {
          if (themeModes.includes('dark')) {
            const nextColorMode = event.matches
              ? 'dark'
              : // find next eligible color mode after 'dark'
                themeModes[(themeModes.indexOf('dark') + 1) % themeModes.length]
            document.documentElement.dataset.theme = nextColorMode
            setColorMode(nextColorMode)
          }
        } catch {
          // no-op if localStorage access fails
        }
      },
      { signal: controller.signal }
    )

    return () => {
      controller.abort()
    }
  }, [themeModes])

  return [
    colorMode,
    useCallback(
      (mode?: string) => {
        console.log('mode', mode)
        if (mode) {
          if (themeModes.includes(mode)) {
            document.documentElement.dataset.theme = mode
            setColorMode(mode)
            try {
              localStorage.setItem('colorMode', mode)
            } catch {
              // no-op if localStorage access fails
            }
          } else {
            throw new Error(
              `[renoun] The color mode "${mode}" is not defined in the theme configuration.`
            )
          }
        } else {
          setColorMode((currentColorMode) => {
            let nextColorMode: string
            if (!currentColorMode) {
              nextColorMode = themeModes[0]
            } else {
              const currentIndex = themeModes.indexOf(currentColorMode)
              nextColorMode = themeModes[(currentIndex + 1) % themeModes.length]
            }
            document.documentElement.dataset.theme = nextColorMode
            try {
              localStorage.setItem('colorMode', nextColorMode)
            } catch {
              // no-op if localStorage access fails
            }
            return nextColorMode
          })
        }
      },
      [themeModes]
    ),
  ] as const
}
