import { readFileSync } from 'node:fs'

let theme: Record<string, any> | null = null

/** Gets a normalized VS Code theme. */
export function getTheme() {
  const themePath = process.env.MDXTS_THEME_PATH

  if (themePath === undefined) {
    throw new Error(
      '[mdxts] The MDXTS_THEME_PATH environment variable is undefined. Set process.env.MDXTS_THEME_PATH or configure the `theme` option in the `mdxts/next` plugin to load a theme.'
    )
  }

  if (theme === null) {
    const json = JSON.parse(readFileSync(themePath, 'utf-8'))

    if (!json.colors.background) {
      json.colors.background = json?.colors?.['editor.background'] || '#000000'
    }

    if (!json.colors.foreground) {
      json.colors.foreground = json?.colors?.['editor.foreground'] || '#ffffff'
    }

    json.name = 'mdxts'

    theme = json
  }

  return theme!
}
