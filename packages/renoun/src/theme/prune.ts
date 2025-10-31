import { grammars as bundledGrammarMap } from '../grammars'

export interface VSCodeTheme {
  name?: string
  type?: 'light' | 'dark'
  colors?: Record<string, string>
  tokenColors?: Array<{
    name?: string
    scope?: string | string[]
    settings: Record<string, unknown>
  }>
  [key: string]: unknown
}

export const BUNDLED_LANGUAGES = new Set<string>([
  'css',
  'html',
  'json',
  'mdx',
  'shellscript',
  'tsx',
])

export const ALLOWED_SCOPES: Set<string> = new Set(
  Object.entries(bundledGrammarMap)
    .filter(([, languages]) =>
      languages.some((language) => BUNDLED_LANGUAGES.has(language))
    )
    .map(([scopeName]) => scopeName)
)

ALLOWED_SCOPES.add('text.html.basic')
ALLOWED_SCOPES.add('text.html.markdown')

export function pruneTheme(
  theme: VSCodeTheme,
  allowedScopes: Set<string> = ALLOWED_SCOPES
): VSCodeTheme {
  const out: VSCodeTheme = {
    type: theme.type,
    colors: theme.colors ? {} : undefined,
    tokenColors: [],
  }

  if (theme.colors) {
    const allowColorKeys = new Set([
      'foreground',
      'background',
      'editor.foreground',
      'editor.background',
      'editorError.foreground',
      'activityBar.background',
      'activityBar.foreground',
      'panel.background',
      'panel.border',
      'editor.hoverHighlightBackground',
      'editor.rangeHighlightBackground',
      'editorLineNumber.foreground',
      'editorLineNumber.activeForeground',
      'editorHoverWidget.background',
      'editorHoverWidget.foreground',
      'editorHoverWidget.border',
      'scrollbarSlider.background',
      'scrollbarSlider.hoverBackground',
      'scrollbarSlider.activeBackground',
      'editorWidget.background',
      'editorWidget.foreground',
      'editorSuggestWidget.background',
      'editorSuggestWidget.foreground',
      'editorSuggestWidget.border',
      'menu.background',
      'menu.foreground',
      'menu.border',
    ])

    for (const [key, value] of Object.entries(theme.colors)) {
      if (allowColorKeys.has(key)) (out.colors ??= {})[key] = value
    }

    if (out.colors && Object.keys(out.colors).length === 0) {
      delete out.colors
    }
  }

  const usedRules: Array<{ scope: string[]; settings: Record<string, unknown> }>
    = []

  const genericPrefixes = new Set([
    'comment',
    'string',
    'variable',
    'support',
    'constant',
    'entity',
    'keyword',
    'storage',
    'punctuation',
    'invalid',
    'meta',
    'markup',
  ])

  for (const rule of theme.tokenColors ?? []) {
    const scopes = Array.isArray(rule.scope)
      ? rule.scope
      : rule.scope
        ? [rule.scope]
        : []

    if (scopes.length === 0) {
      usedRules.push({
        scope: [],
        settings: rule.settings ?? {},
      })
      continue
    }

    const keep = scopes.some((scope) => {
      const head = scope.split('.')[0]
      if (genericPrefixes.has(head)) return true

      for (const allow of allowedScopes) {
        if (scope.startsWith(allow) || scope.includes(allow)) return true
      }

      return false
    })

    if (keep) {
      usedRules.push({
        scope: scopes,
        settings: rule.settings ?? {},
      })
    }
  }

  function scopeKey(scopes: string[]): string {
    if (!scopes.length) return '__UNSCOPED__'
    return Array.from(new Set(scopes)).sort().join('|')
  }

  const kept = new Set<string>()
  const deduped: Array<{ scope?: string[]; settings: Record<string, unknown> }> = []

  for (let index = usedRules.length - 1; index >= 0; index--) {
    const rule = usedRules[index]
    const key = `${scopeKey(rule.scope)}::${JSON.stringify(rule.settings)}`
    if (kept.has(key)) continue
    kept.add(key)
    deduped.push({
      scope: rule.scope.length ? rule.scope : undefined,
      settings: rule.settings,
    })
  }

  deduped.reverse()
  out.tokenColors = deduped

  if (!out.tokenColors!.some((rule) => !rule.scope)) {
    out.tokenColors!.unshift({
      settings: {
        foreground: (theme.colors ?? {})['editor.foreground'] ?? '#e0e0e0',
      },
    })
  }

  return out
}

export function toJsonModule(jsonText: string): string {
  const singleQuoted = `'${jsonText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`

  return `export default Object.freeze(\n  JSON.parse(\n    ${singleQuoted}\n  )\n)\n`
}
