import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadConfig } from './load-config.js'

let theme: Record<string, any> | null = null

/** Gets the theme path from the `renoun.json` config. */
function getThemePath(themeName?: string) {
  const config = loadConfig()

  if (typeof config.theme === 'object') {
    // Default to the first theme if no theme name is provided.
    if (themeName === undefined) {
      return Object.values(config.theme)[0]
    }
    return config.theme[themeName]
  }

  return typeof config.theme === 'string' && config.theme.endsWith('.json')
    ? resolve(process.cwd(), config.theme)
    : config.theme
}

const cachedThemes = new Map<string, Record<string, any>>()

/** Gets a normalized VS Code theme. */
export async function getTheme(themeName?: string) {
  const themePath = getThemePath(themeName)

  if (themePath === undefined) {
    throw new Error(
      `[renoun] No valid theme found. Ensure the \`theme\` property in the \`renoun.json\` at the root of your project is configured correctly. For more information, visit: https://renoun.dev/docs/configuration`
    )
  }

  if (cachedThemes.has(themePath)) {
    return cachedThemes.get(themePath)!
  }

  const { bundledThemes, normalizeTheme } = await import('shiki/bundle/web')

  if (theme === null) {
    if (themePath.endsWith('.json')) {
      theme = JSON.parse(readFileSync(themePath, 'utf-8'))
    } else if (themePath in bundledThemes) {
      const themeKey = themePath as keyof typeof bundledThemes
      const resolvedTheme = await bundledThemes[themeKey].call(null)
      theme = resolvedTheme.default
    } else {
      throw new Error(
        `[renoun] The theme "${themePath}" is not a valid JSON file or a bundled theme.`
      )
    }

    const resolvedTheme = theme!

    // Set fallback values for missing colors.
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
    theme.name = themeName ?? 'renoun'
  }

  cachedThemes.set(themePath, theme)
  return theme!
}

/**
 * Generates CSS variables for all theme colors.
 * @internal
 */
export async function getThemeColorVariables() {
  const { theme } = loadConfig()

  if (typeof theme === 'string') {
    throw new Error(
      `[renoun] The \`theme\` property in the \`renoun.json\` at the root of your project must be an object. For more information, visit: https://renoun.dev/docs/configuration`
    )
  }

  const themeVariables: Record<string, any> = {}

  for (const themeName of Object.keys(theme)) {
    const currentTheme = await getTheme(themeName)
    const variables: Record<string, any> = {}

    for (const [key, value] of Object.entries(currentTheme.colors)) {
      variables[`--${key.replace(/\./g, '-')}`] = value
    }

    themeVariables[`[data-theme="${themeName}"]`] = variables
  }

  return themeVariables
}

let cachedThemeColors: Record<string, any> | null = null

/**
 * Gets the configured VS Code theme colors as a nested object.
 *
 * - For a single theme, returns the actual color values.
 * - For multiple themes, returns a merged object (union of keys)
 *   where each leaf is a CSS variable reference.
 *
 * Missing keys in any particular theme will result in an undefined CSS variable,
 * allowing for a graceful fallback.
 *
 * @internal
 */
export async function getThemeColors() {
  if (cachedThemeColors !== null) {
    return cachedThemeColors
  }

  const config = loadConfig()
  let flatColors: Record<string, any> = {}
  let useVariables = false

  if (typeof config.theme === 'string') {
    const { colors } = await getTheme()
    flatColors = colors
  } else {
    const themeNames = Object.keys(config.theme)

    // Merge keys from all themes
    if (themeNames.length > 1) {
      useVariables = true
      const unionKeys = new Set<string>()

      for (const themeName of themeNames) {
        const currentTheme = await getTheme(themeName)

        for (const key in currentTheme.colors) {
          unionKeys.add(key)
        }
      }

      for (const key of unionKeys) {
        flatColors[key] = null
      }
    }
    // Only one theme defined
    else {
      const { colors } = await getTheme(themeNames[0])
      flatColors = colors
    }
  }

  cachedThemeColors = buildNestedObject(flatColors, useVariables)

  return cachedThemeColors
}

/**
 * Helper to build a nested object from dot‑notation keys.
 * If `useVariables` is true, each leaf value is transformed into a CSS variable reference.
 */
function buildNestedObject(
  flatObject: Record<string, any>,
  useVariables: boolean
) {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(flatObject)) {
    const parts = key.split('.')
    let target = result

    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {}
      target = target[parts[i]]
    }

    target[parts[parts.length - 1]] = useVariables
      ? `var(--${key.replace(/\./g, '-')})`
      : value
  }

  return result
}
