import { bundledThemes, normalizeTheme } from 'shiki/bundle/web'
import { readFileSync } from 'node:fs'

let theme: Record<string, any> | null = null

/** Gets a normalized VS Code theme. */
export async function getTheme() {
  const themePath = process.env.MDXTS_THEME_PATH

  if (themePath === undefined) {
    throw new Error(
      '[mdxts] The MDXTS_THEME_PATH environment variable is undefined. Set process.env.MDXTS_THEME_PATH or configure the `theme` option in the `mdxts/next` plugin to load a theme.'
    )
  }

  if (theme === null) {
    if (themePath.endsWith('.json')) {
      theme = JSON.parse(readFileSync(themePath, 'utf-8'))
    } else if (themePath in bundledThemes) {
      const themeKey = themePath as keyof typeof bundledThemes
      const resolveTheme = bundledThemes[themeKey]
      theme = await resolveTheme().then((mod) => mod.default)
    } else {
      throw new Error(
        `[mdxts] The theme "${themePath}" is not a valid JSON file or a bundled theme.`
      )
    }

    const resolvedTheme = theme!

    if (!resolvedTheme.colors.background) {
      resolvedTheme.colors.background =
        resolvedTheme.colors['editor.background'] || '#000000'
    }

    if (!resolvedTheme.colors.foreground) {
      resolvedTheme.colors.foreground =
        resolvedTheme.colors['editor.foreground'] || '#ffffff'
    }

    theme = normalizeTheme(resolvedTheme)

    theme.name = 'mdxts'
  }

  return theme!
}
