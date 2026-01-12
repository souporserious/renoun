import { readFileSync, watch } from 'node:fs'
import { resolve } from 'node:path'

import type { ConfigurationOptions } from '../components/Config/types.ts'
import type { TextMateThemeRaw } from './create-tokenizer.ts'
import { loadTmTheme } from './load-package.ts'
import { validateTheme, type Theme } from './theme-schema.ts'

export const BASE_TOKEN_CLASS_NAME = '×'

/** Resolves the theme config name from the `RootProvider` config. */
function getThemeConfigName(
  themeName?: string,
  themeConfig?: ConfigurationOptions['theme']
) {
  if (typeof themeConfig === 'object') {
    // Default to the first theme if no theme name is provided.
    if (themeName === undefined) {
      return Object.values(themeConfig)[0]
    }

    // Try matching theme config name
    if (
      Object.values(themeConfig)
        .map((theme) => (typeof theme === 'string' ? theme : theme[0]))
        .includes(themeName)
    ) {
      return themeName
    }

    return (themeConfig as Record<string, any>)[themeName]
  }

  return themeConfig
}

const cachedThemes = new Map<string | undefined, TextMateThemeRaw>()
const themeWatchers = new Map<string, ReturnType<typeof watch>>()
// Only create file-system watchers while developing so production builds
// don't hold onto extra handles or perform redundant work.
const shouldWatchThemes =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

function ensureThemeWatcher(themePath: string) {
  if (!shouldWatchThemes || themeWatchers.has(themePath)) {
    return
  }

  try {
    const watcher = watch(themePath, { persistent: false }, (eventType) => {
      cachedThemes.delete(themePath)

      if (eventType === 'rename') {
        watcher.close()
        themeWatchers.delete(themePath)
      }
    })

    watcher.on('error', () => {
      watcher.close()
      themeWatchers.delete(themePath)
    })

    themeWatchers.set(themePath, watcher)
  } catch {
    // If the file cannot be watched (e.g. it was removed), fail silently.
  }
}

/** Gets a normalized VS Code theme. */
export async function getTheme(
  themeName?: string,
  themeConfig?: ConfigurationOptions['theme']
): Promise<TextMateThemeRaw> {
  const themeConfigName = getThemeConfigName(themeName, themeConfig)

  let themePath: string | undefined
  if (themeConfigName === undefined) {
    // fall back to built-in default theme when no theme is configured
    themePath = undefined
  } else if (Array.isArray(themeConfigName)) {
    themePath = themeConfigName[0]
  } else {
    themePath = themeConfigName
  }

  if (themePath && themePath.endsWith('.json')) {
    themePath = resolve(process.cwd(), themePath)
  }

  const cachedTheme = cachedThemes.get(themePath)

  if (themePath && themePath.endsWith('.json')) {
    ensureThemeWatcher(themePath)

    if (cachedTheme) {
      return cachedTheme
    }
  } else if (cachedTheme) {
    return cachedTheme
  }

  const { themes } = await import('../grammars/index.ts')
  const themeOverrides = Array.isArray(themeConfigName)
    ? themeConfigName[1]
    : undefined
  let theme: Theme

  if (themePath === undefined) {
    theme = (await import('../theme.ts')).default as Theme
  } else if (themePath.endsWith('.json')) {
    theme = JSON.parse(readFileSync(themePath, 'utf-8')) as Theme
  } else if (themes.includes(themePath as any)) {
    const tmTheme = await loadTmTheme(themePath as any)
    if (tmTheme) {
      theme = tmTheme as Theme
    } else {
      throw new Error(
        `[renoun] The theme "${themePath}" could not be loaded, ensure the "tm-themes" package is installed in your project.`
      )
    }
  } else {
    throw new Error(
      `[renoun] The theme "${themePath}" is not a valid JSON file or a bundled theme.`
    )
  }

  // Validate loaded theme and overrides before processing.
  try {
    validateTheme(theme)
    if (themeOverrides) {
      validateTheme(themeOverrides)
    }
  } catch (error) {
    throw new Error(`[renoun] The theme "${themePath}" failed validation`, {
      cause: error,
    })
  }

  const finalTheme = normalizeTheme(
    {
      ...theme,
      // Preserve the theme's intrinsic name when no explicit name/config is provided
      name:
        themeConfigName === undefined
          ? theme['name']
          : Array.isArray(themeConfigName)
            ? themeConfigName[0]
            : themeConfigName,
    },
    themeOverrides
  )

  cachedThemes.set(themePath, finalTheme)

  return finalTheme
}

const prefix = 'rn'

/**
 * Helper to convert a theme key (e.g. "editorHoverWidget.background")
 * into a CSS variable name in kebab-case (e.g. "editor-hover-widget-background").
 */
function toCssVariableName(key: string): string {
  const variable = key
    .split('.')
    .map((part) => part.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-')

  return `${prefix}-${variable}`
}

/** Generates CSS variables for all theme colors. */
export async function getThemeColorVariables(
  theme: ConfigurationOptions['theme']
) {
  if (typeof theme === 'string') {
    throw new Error(
      `[renoun] The \`theme\` property on \`RootProvider\` must be an object when using the ThemeProvider component. For more information, visit: https://renoun.dev/docs/configuration`
    )
  }

  if (theme === undefined) {
    return {}
  }

  const themeVariables: Record<string, any> = {}

  for (const themeName of Object.keys(theme)) {
    const currentTheme = await getTheme(themeName, theme)
    const variables: Record<string, any> = {}

    if (currentTheme.colors) {
      for (const [key, value] of Object.entries(currentTheme.colors)) {
        variables[`--${toCssVariableName(key)}`] = value
      }
    }

    themeVariables[`[data-theme="${themeName}"]`] = variables
  }

  return themeVariables
}

/**
 * Fallbacks for theme colors used throughout renoun.
 * Each key represents a final color key, and its array is the fallback chain.
 */
const themeFallbacks = {
  'activityBar.background': ['editor.background'],
  'activityBar.foreground': ['editor.foreground'],
  'panel.background': ['editor.background'],
  'panel.border': ['editorSuggestWidget.border', 'menu.border'],
  'editor.hoverHighlightBackground': [
    {
      dark: 'rgba(255, 255, 255, 0.1)',
      light: 'rgba(0, 0, 0, 0.06)',
    },
  ],
  'editor.rangeHighlightBackground': ['editor.hoverHighlightBackground'],
  'editorError.foreground': [
    {
      dark: '#f14c4c',
      light: '#f14c4c',
    },
  ],
  'editorLineNumber.foreground': ['editor.foreground'],
  'editorLineNumber.activeForeground': ['editorLineNumber.foreground'],
  'editorHoverWidget.background': [
    'editorWidget.background',
    'editorSuggestWidget.background',
    'menu.background',
    'editor.background',
  ],
  'editorHoverWidget.foreground': [
    'editorWidget.foreground',
    'editorSuggestWidget.foreground',
    'menu.foreground',
    'editor.foreground',
  ],
  'editorHoverWidget.border': [
    'editorWidget.border',
    'editorSuggestWidget.border',
    'menu.border',
    {
      dark: '#454545',
      light: '#c8c8c8',
    },
  ],
  'scrollbarSlider.background': [
    {
      dark: 'rgba(121, 121, 121, 0.4)',
      light: 'rgba(121, 121, 121, 0.2)',
    },
  ],
  'scrollbarSlider.hoverBackground': [
    {
      dark: 'rgba(100, 100, 100, 0.7)',
      light: 'rgba(100, 100, 100, 0.4)',
    },
  ],
  'scrollbarSlider.activeBackground': [
    {
      dark: 'rgba(191, 191, 191, 0.4)',
      light: 'rgba(191, 191, 191, 0.2)',
    },
  ],
}

type DotNestedObject<
  Key extends string,
  Value,
> = Key extends `${infer Head}.${infer Rest}`
  ? { [_ in Head]: DotNestedObject<Rest, Value> }
  : { [_ in Key]: Value }

type UnionToIntersection<Union> = (
  Union extends any ? (k: Union) => void : never
) extends (k: infer Intersection) => void
  ? Intersection
  : never

type ThemeColorFallbacks = UnionToIntersection<
  {
    [Key in keyof typeof themeFallbacks]: DotNestedObject<Key, string>
  }[keyof typeof themeFallbacks]
>

export type ThemeColors = {
  foreground: string
  background: string
} & ThemeColorFallbacks

const cachedThemeColors = new Map<string, Record<string, any>>()

/**
 * Gets the configured VS Code theme colors as a nested object.
 *
 * - For a single theme, returns the actual color values.
 * - For multiple themes, returns a merged object (union of keys)
 *   where each leaf is a CSS variable reference.
 *
 * Missing keys in any particular theme will result in an undefined CSS variable,
 * allowing for a graceful fallback.
 */
export async function getThemeColors(
  themeConfig: ConfigurationOptions['theme']
): Promise<ThemeColors> {
  const cacheKey = createThemeCacheKey(themeConfig)
  const cached = cachedThemeColors.get(cacheKey)
  if (cached) return cached as ThemeColors

  let flatColors: Record<string, any> = {}
  let useVariables = false

  if (typeof themeConfig === 'string') {
    const { colors } = await getTheme(undefined, themeConfig)
    if (colors) {
      flatColors = colors
    }
  } else {
    const themeNames = themeConfig ? Object.keys(themeConfig) : []

    // Merge keys from all themes
    if (themeNames.length > 1) {
      useVariables = true
      const unionKeys = new Set<string>()

      for (const themeName of themeNames) {
        const currentTheme = await getTheme(themeName, themeConfig)
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
      const { colors } = await getTheme(themeNames[0], themeConfig)
      if (colors) {
        flatColors = colors
      }
    }
  }

  const nested = buildNestedObject(flatColors, useVariables)
  cachedThemeColors.set(cacheKey, nested)

  return nested as ThemeColors
}

/**
 * Helper to build a nested object from dot‑notation keys.
 * If `useVariables` is true, each leaf value is transformed into a CSS variable reference
 * using the toCssVarName helper.
 */
function buildNestedObject(
  flatObject: Record<string, any>,
  useVariables: boolean
) {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(flatObject)) {
    const parts = key.split('.')
    let target = result

    for (let index = 0; index < parts.length - 1; index++) {
      if (!target[parts[index]]) target[parts[index]] = {}
      target = target[parts[index]]
    }

    target[parts[parts.length - 1]] = useVariables
      ? `var(--${toCssVariableName(key)})`
      : value
  }

  return result
}

/** Build a stable cache key for a theme configuration. */
function createThemeCacheKey(themeConfig: ConfigurationOptions['theme']) {
  if (typeof themeConfig === 'string' || themeConfig === undefined) {
    return String(themeConfig ?? 'undefined')
  }
  const entries = Object.entries(themeConfig)
    .map(([mode, val]) => {
      if (Array.isArray(val)) {
        return [mode, val[0], val[1] ? JSON.stringify(val[1]) : ''] as const
      }
      return [mode, val] as const
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return JSON.stringify(entries)
}

/**
 * Gets the theme token variables for each theme.
 *
 * ```js
 * {
 *   '[data-theme="light"] .×': { '--0': 'var(--0fg, inherit)' },
 *   '[data-theme="dark"] .×': { '--0': 'var(--1fg, inherit)' },
 * }
 * ```
 */
export function getThemeTokenVariables(
  themeConfig: ConfigurationOptions['theme']
) {
  if (typeof themeConfig === 'string') {
    return {}
  }

  const themeVariables: Record<string, Record<string, string>> = {}
  const themeNames = themeConfig ? Object.keys(themeConfig) : []

  for (let index = 0; index < themeNames.length; index++) {
    themeVariables[
      `[data-theme="${themeNames[index]}"] .${BASE_TOKEN_CLASS_NAME}`
    ] = {
      '--0': `var(--${index}fg, inherit)`,
      '--00': `var(--${index}fs, normal)`,
      '--01': `var(--${index}fw, normal)`,
      '--02': `var(--${index}td, none)`,
      backgroundColor: `var(--${index}bg)`,
    }
  }

  return themeVariables
}

/** Infer theme type from background color when not explicitly provided. */
function inferThemeType(theme: Theme): 'light' | 'dark' {
  if (theme.type === 'light' || theme.type === 'dark') {
    return theme.type
  }

  const editorBg = theme.colors['editor.background']
  const bg = editorBg || theme.colors['background'] || undefined

  if (typeof bg !== 'string') {
    return 'dark'
  }

  const rgb = parseColorToRgb(bg)
  if (!rgb) {
    return 'dark'
  }

  // Perceived brightness heuristic
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return brightness >= 128 ? 'light' : 'dark'
}

function parseColorToRgb(
  value: string
): { r: number; g: number; b: number } | null {
  const hex = value.trim().toLowerCase()
  // #rgb or #rrggbb
  if (hex.startsWith('#')) {
    const raw = hex.slice(1)
    if (raw.length === 3) {
      const r = parseInt(raw[0] + raw[0], 16)
      const g = parseInt(raw[1] + raw[1], 16)
      const b = parseInt(raw[2] + raw[2], 16)
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return { r, g, b }
      }
    } else if (raw.length === 6) {
      const r = parseInt(raw.slice(0, 2), 16)
      const g = parseInt(raw.slice(2, 4), 16)
      const b = parseInt(raw.slice(4, 6), 16)
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return { r, g, b }
      }
    }
    return null
  }

  // rgb() or rgba()
  const rgbMatch = value
    .trim()
    .match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1))?\s*\)$/i
    )
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)))
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)))
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)))
    return { r, g, b }
  }

  return null
}

/** Normalize a VS Code theme to a TextMate theme. */
export function normalizeTheme(
  theme: Theme,
  overrides?: Theme
): TextMateThemeRaw {
  // Apply theme overrides.
  if (overrides) {
    const mergedTheme = mergeThemeColors(theme, overrides)
    theme.colors = mergedTheme.colors
    theme.tokenColors = mergedTheme.tokenColors
    theme.semanticTokenColors = mergedTheme.semanticTokenColors
  }

  // Normalize theme settings.
  if (!theme.settings) {
    if (theme.tokenColors) {
      theme.settings = theme.tokenColors
      delete theme.tokenColors
    } else {
      theme.settings = []
    }
  }

  applyForegroundBackground(theme)

  applyFallbacks(theme.colors, inferThemeType(theme))

  return theme as TextMateThemeRaw
}

/** Merge two VS Code theme JSON objects (baseTheme and overrides). */
function mergeThemeColors(baseTheme: Theme, overrides: Theme) {
  if (!overrides) {
    return {
      colors: baseTheme.colors,
      tokenColors: baseTheme.tokenColors,
      semanticTokenColors: baseTheme.semanticTokenColors,
    }
  }

  const mergedColors = {
    ...baseTheme.colors,
    ...overrides.colors,
  }
  const mergedTokenColors = [
    ...(baseTheme.tokenColors ?? []),
    ...(overrides.tokenColors ?? []),
  ]
  const baseSemanticTokenColors = baseTheme.semanticTokenColors ?? {}
  const overrideSemanticTokenColors = overrides.semanticTokenColors ?? {}
  const allScopes = new Set([
    ...Object.keys(baseSemanticTokenColors),
    ...Object.keys(overrideSemanticTokenColors),
  ])
  const mergedSemanticTokenColors: Record<string, any> = {}

  for (const scope of allScopes) {
    const baseValue = baseSemanticTokenColors[scope]
    const overrideValue = overrideSemanticTokenColors[scope]

    if (baseValue == null) {
      mergedSemanticTokenColors[scope] = overrideValue
    } else if (typeof baseValue === 'string') {
      mergedSemanticTokenColors[scope] = overrideValue ?? baseValue
    } else if (typeof baseValue === 'object' && baseValue !== null) {
      if (typeof overrideValue === 'object' && overrideValue !== null) {
        mergedSemanticTokenColors[scope] = { ...baseValue, ...overrideValue }
      } else {
        mergedSemanticTokenColors[scope] = overrideValue ?? baseValue
      }
    } else {
      mergedSemanticTokenColors[scope] = overrideValue ?? baseValue
    }
  }

  return {
    colors: mergedColors,
    tokenColors: mergedTokenColors,
    semanticTokenColors: mergedSemanticTokenColors,
  }
}

/** Applies default foreground and background colors to the theme. */
function applyForegroundBackground(theme: Theme) {
  const globalSetting = theme.settings
    ? theme.settings.find((setting: any) => !setting.name && !setting.scope)
    : undefined

  if (globalSetting?.settings) {
    if (globalSetting.settings.foreground) {
      theme.colors['foreground'] = globalSetting.settings.foreground
    }
    if (globalSetting.settings.background) {
      theme.colors['background'] = globalSetting.settings.background
    }
  }
  if (!theme.colors['editor.background']) {
    theme.colors['editor.background'] = theme.colors['background'] || '#000000'
  }
  if (!theme.colors['editor.foreground']) {
    theme.colors['editor.foreground'] = theme.colors['foreground'] || '#ffffff'
  }
  if (!theme.colors['background']) {
    theme.colors['background'] = theme.colors['editor.background']
  }
  if (!theme.colors['foreground']) {
    theme.colors['foreground'] = theme.colors['editor.foreground']
  }

  if (!globalSetting) {
    if (!theme.settings) {
      theme.settings = []
    }
    theme.settings.unshift({
      settings: {
        foreground: theme.colors['foreground'],
        background: theme.colors['background'],
      },
    })
  }
}

/** Applies fallback chains for color keys as specified in `themeFallbacks`. */
function applyFallbacks(
  colors: Record<string, string | null>,
  type: 'light' | 'dark'
) {
  for (const [key, chain] of Object.entries(themeFallbacks)) {
    if (colors[key] != null) continue

    let fallbackValue: string | undefined
    for (const item of chain) {
      if (typeof item === 'string') {
        if (colors[item]) {
          fallbackValue = colors[item]
          break
        }
      } else if (typeof item === 'object') {
        fallbackValue = item[type]
        break
      }
    }

    if (fallbackValue !== undefined) {
      colors[key] = fallbackValue
    }
  }
}

/** Determines if multiple themes are configured. */
export function hasMultipleThemes(theme: ConfigurationOptions['theme']) {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return false
  }
  return true
}
