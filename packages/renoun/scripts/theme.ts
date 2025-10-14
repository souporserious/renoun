import fs from 'node:fs'
import path from 'node:path'
import { grammars } from 'tm-grammars'

interface VSCodeTheme {
  name?: string
  type?: 'light' | 'dark'
  colors?: Record<string, string>
  tokenColors?: Array<{
    name?: string
    scope?: string | string[]
    settings: any
  }>
  [key: string]: any
}

const BUNDLED_LANGUAGES = new Set<string>([
  'css',
  'html',
  'json',
  'mdx',
  'shellscript',
  'tsx',
])

// Build allowed root scopes from bundled languages
const ALLOWED_SCOPES = new Set<string>(
  grammars
    .filter((grammar) => BUNDLED_LANGUAGES.has(grammar.name))
    .map((grammar) => grammar.scopeName)
)
// Add commonly embedded/related roots we rely on
ALLOWED_SCOPES.add('text.html.basic')
ALLOWED_SCOPES.add('text.html.markdown')

/** Prune a VS Code theme to only include reachable scopes. */
function pruneTheme(
  theme: VSCodeTheme,
  allowedScopes: Set<string>
): VSCodeTheme {
  const out: VSCodeTheme = {
    type: theme.type,
    colors: theme.colors ? {} : undefined,
    tokenColors: [],
  }

  // keep a small set of editor colors we actually read in renoun
  if (theme.colors) {
    const allowColorKeys = new Set([
      // top-level colors used by renoun
      'foreground',
      'background',
      // editor base colors and sources
      'editor.foreground',
      'editor.background',
      // UI areas referenced directly
      'activityBar.background',
      'activityBar.foreground',
      'panel.background',
      'panel.border',
      // editor highlights used for UI effects
      'editor.hoverHighlightBackground',
      'editor.rangeHighlightBackground',
      // line numbers
      'editorLineNumber.foreground',
      'editorLineNumber.activeForeground',
      // hover widget
      'editorHoverWidget.background',
      'editorHoverWidget.foreground',
      'editorHoverWidget.border',
      // scrollbar slider colors
      'scrollbarSlider.background',
      'scrollbarSlider.hoverBackground',
      'scrollbarSlider.activeBackground',
      // fallback sources (to compute the above when missing)
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
    if (out.colors && !Object.keys(out.colors).length) delete out.colors
  }

  const usedRules: Array<{ scope: string[]; settings: any }> = []

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
      usedRules.push({ scope: [], settings: rule.settings })
      continue
    }

    const keep = scopes.some((scope) => {
      // keep generic categories (keyword, storage, punctuation, etc.)
      const head = scope.split('.')[0]
      if (genericPrefixes.has(head)) return true

      // keep if scope mentions an allowed root (language we ship)
      for (const allow of allowedScopes) {
        if (scope.startsWith(allow) || scope.includes(allow)) return true
      }
      return false
    })

    if (keep) {
      usedRules.push({ scope: scopes, settings: rule.settings })
    }
  }

  // dedupe identical settings
  const seen = new Map<string, number>()
  for (const rule of usedRules) {
    const key = JSON.stringify(rule.settings)
    if (seen.has(key)) {
      const index = seen.get(key)!
      // merge scopes
      out.tokenColors![index].scope = [
        ...new Set([
          ...(Array.isArray(out.tokenColors![index].scope)
            ? (out.tokenColors![index].scope as string[])
            : []),
          ...rule.scope,
        ]),
      ]
    } else {
      seen.set(key, out.tokenColors!.length)
      out.tokenColors!.push({
        scope: rule.scope.length ? rule.scope : undefined,
        settings: rule.settings,
      })
    }
  }

  // final fallback rule to avoid “black on black” if theme misses something
  if (!out.tokenColors!.some((rule) => !rule.scope)) {
    out.tokenColors!.unshift({
      settings: {
        foreground: theme?.colors?.['editor.foreground'] ?? '#e0e0e0',
      },
    })
  }

  return out
}

async function main() {
  const themePath = path.resolve('vendor/theme.json')
  if (fs.existsSync(themePath)) {
    const theme: VSCodeTheme = JSON.parse(fs.readFileSync(themePath, 'utf8'))
    const prunedTheme = pruneTheme(theme, ALLOWED_SCOPES)
    const themeOut = path.resolve('src/theme.json')
    fs.mkdirSync(path.dirname(themeOut), { recursive: true })
    fs.writeFileSync(themeOut, JSON.stringify(prunedTheme))
  }

  console.log('✓ Pruned theme')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
