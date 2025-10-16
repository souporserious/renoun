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
  function scopeKey(scopes: string[]): string {
    if (!scopes.length) return '__UNSCOPED__'
    // use set to drop duplicates, sort for order-insensitive equality
    return Array.from(new Set(scopes)).sort().join('|')
  }

  // build from the end so the last matching rule is kept.
  const kept = new Set<string>()
  const deduped: Array<{ scope?: string[]; settings: any }> = []

  for (let index = usedRules.length - 1; index >= 0; index--) {
    const rule = usedRules[index]
    const key = scopeKey(rule.scope) + '::' + rule.settings
    if (kept.has(key)) continue // earlier duplicate → drop
    kept.add(key)
    deduped.push({
      scope: rule.scope.length ? rule.scope : undefined, // preserve later rule's scope order
      settings: rule.settings,
    })
  }

  // restore original order
  deduped.reverse()
  out.tokenColors = deduped

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
    const themeOut = path.resolve('src/theme.ts')
    fs.mkdirSync(path.dirname(themeOut), { recursive: true })
    fs.writeFileSync(
      themeOut,
      toJsonModule(JSON.stringify(prunedTheme)),
      'utf8'
    )
  }

  console.log('✓ Pruned theme')
}

function toJsonModule(jsonText: string): string {
  const singleQuoted = `'${jsonText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`

  return `export default Object.freeze(\n  JSON.parse(\n    ${singleQuoted}\n  )\n)\n`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
