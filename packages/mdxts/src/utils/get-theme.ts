import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

let theme: Record<string, any> | null = null

/** Load config from .mdxts/config.json */
async function loadConfig(): Promise<{ theme?: string }> {
  const configPath = resolve(process.cwd(), '.mdxts/config.json')
  const configExists = existsSync(configPath)

  if (configExists) {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, any>
  }

  return {}
}

/** Gets the theme path from the config or environment variable. */
async function getThemePath() {
  const config = await loadConfig()
  const theme = config.theme ?? process.env.MDXTS_THEME_PATH ?? 'nord'

  return theme.endsWith('.json') ? resolve(process.cwd(), theme) : theme
}

/** Gets a normalized VS Code theme. */
export async function getTheme() {
  const { bundledThemes, normalizeTheme } = await import('shiki/bundle/web')
  const themePath = await getThemePath()

  if (themePath === undefined) {
    throw new Error(
      '[mdxts] The theme is undefined. Either create a config at ".mdxts/config.json" that defines a valid theme or set "process.env.MDXTS_THEME_PATH" to a valid theme.'
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

    if (!resolvedTheme.colors['editor.background']) {
      resolvedTheme.colors['editor.background'] =
        resolvedTheme.colors.background || '#000000'
    }

    if (!resolvedTheme.colors['editor.foreground']) {
      resolvedTheme.colors['editor.foreground'] =
        resolvedTheme.colors.foreground || '#ffffff'
    }

    if (!resolvedTheme.colors.background) {
      resolvedTheme.colors.background =
        resolvedTheme.colors['editor.background']
    }

    if (!resolvedTheme.colors.foreground) {
      resolvedTheme.colors.foreground =
        resolvedTheme.colors['editor.foreground']
    }

    if (!resolvedTheme.colors['panel.background']) {
      resolvedTheme.colors['panel.background'] =
        resolvedTheme.colors['editor.background']
    }

    if (!resolvedTheme.colors['panel.border']) {
      resolvedTheme.colors['panel.border'] =
        resolvedTheme.colors['editor.foreground']
    }

    if (!resolvedTheme.colors['editor.hoverHighlightBackground']) {
      resolvedTheme.colors['editor.hoverHighlightBackground'] =
        'rgba(255, 255, 255, 0.1)'
    }

    if (!resolvedTheme.colors['activityBar.background']) {
      resolvedTheme.colors['activityBar.background'] =
        resolvedTheme.colors['editor.background']
    }

    if (!resolvedTheme.colors['activityBar.foreground']) {
      resolvedTheme.colors['activityBar.foreground'] =
        resolvedTheme.colors['editor.foreground']
    }

    if (!resolvedTheme.colors['scrollbarSlider.background']) {
      resolvedTheme.colors['scrollbarSlider.background'] =
        'rgba(121, 121, 121, 0.4)'
    }

    if (!resolvedTheme.colors['scrollbarSlider.hoverBackground']) {
      resolvedTheme.colors['scrollbarSlider.hoverBackground'] =
        'rgba(100, 100, 100, 0.7)'
    }

    if (!resolvedTheme.colors['scrollbarSlider.activeBackground']) {
      resolvedTheme.colors['scrollbarSlider.activeBackground'] =
        'rgba(191, 191, 191, 0.4)'
    }

    theme = normalizeTheme(resolvedTheme)

    theme.name = 'mdxts'
  }

  return theme!
}
