import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadConfig } from './load-config.js'

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
  let theme: Record<string, any>

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

  // Set fallback values for missing colors.
  if (!theme.colors['editor.background']) {
    theme.colors['editor.background'] = theme.colors.background || '#000000'
  }
  if (!theme.colors['editor.foreground']) {
    theme.colors['editor.foreground'] = theme.colors.foreground || '#ffffff'
  }
  if (!theme.colors.background) {
    theme.colors.background = theme.colors['editor.background']
  }
  if (!theme.colors.foreground) {
    theme.colors.foreground = theme.colors['editor.foreground']
  }
  if (!theme.colors['panel.background']) {
    theme.colors['panel.background'] = theme.colors['editor.background']
  }
  if (!theme.colors['panel.border']) {
    theme.colors['panel.border'] = theme.colors['editor.foreground']
  }
  if (!theme.colors['editor.hoverHighlightBackground']) {
    theme.colors['editor.hoverHighlightBackground'] = 'rgba(255, 255, 255, 0.1)'
  }
  if (!theme.colors['activityBar.background']) {
    theme.colors['activityBar.background'] = theme.colors['editor.background']
  }
  if (!theme.colors['activityBar.foreground']) {
    theme.colors['activityBar.foreground'] = theme.colors['editor.foreground']
  }
  if (!theme.colors['scrollbarSlider.background']) {
    theme.colors['scrollbarSlider.background'] = 'rgba(121, 121, 121, 0.4)'
  }
  if (!theme.colors['scrollbarSlider.hoverBackground']) {
    theme.colors['scrollbarSlider.hoverBackground'] = 'rgba(100, 100, 100, 0.7)'
  }
  if (!theme.colors['scrollbarSlider.activeBackground']) {
    theme.colors['scrollbarSlider.activeBackground'] =
      'rgba(191, 191, 191, 0.4)'
  }

  theme = normalizeTheme(theme)
  theme.name = themeName

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

/**
 * Gets the theme token variables for each theme.
 *
 * ```js
 * {
 *   '[data-theme="light"] & span': { color: 'var(--0)' },
 *   '[data-theme="dark"] & span': { color: 'var(--1)' },
 * }
 *
 */
export function getThemeTokenVariables() {
  const config = loadConfig()

  if (typeof config.theme === 'string') {
    return {}
  }

  const themeVariables: Record<string, any> = {}
  const themeNames = Object.keys(config.theme)

  for (let index = 0; index < themeNames.length; index++) {
    themeVariables[`[data-theme="${themeNames[index]}"] & span`] = {
      color: `var(--${index})`,
    }
  }

  return themeVariables
}
