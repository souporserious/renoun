import { readFileSync } from 'node:fs'

let theme: Record<string, any> | null = null

/** Returns the configured code syntax highlighting theme. */
export function getTheme() {
  const themePath = process.env.MDXTS_THEME_PATH

  if (themePath === undefined) {
    throw new Error(
      '[mdxts] The MDXTS_THEME_PATH environment variable is undefined. Set process.env.MDXTS_THEME_PATH or configure the `theme` option in the `mdxts/next` plugin to load a theme.'
    )
  }

  if (theme === null) {
    theme = JSON.parse(readFileSync(themePath, 'utf-8'))
  }

  return theme!
}
