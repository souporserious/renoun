import { grammars } from 'tm-grammars'
import { themes } from 'tm-themes'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EmulatedRegExp, toRegExpDetails } from 'oniguruma-to-es'

const BUNDLED_LANGUAGES = new Set<string>([
  'css',
  'html',
  'json',
  'mdx',
  'shellscript',
  'tsx',
  'yaml',
])
const grammarLoaders = grammars
  .filter((grammar) => BUNDLED_LANGUAGES.has(grammar.name))
  .map((grammar) => {
    const importString = `() => import('./${grammar.name}.ts')`
    return `  '${grammar.scopeName}': ${importString}`
  })
  .join(',\n')
const grammarAliases = grammars.reduce(
  (acc, grammar) => {
    const mergedAliases = new Set<string>([
      grammar.name,
      ...(grammar.aliases || []),
    ])

    if (acc[grammar.scopeName]) {
      // Merge aliases if scopeName already exists
      acc[grammar.scopeName] = new Set([
        ...acc[grammar.scopeName],
        ...mergedAliases,
      ])
    } else {
      acc[grammar.scopeName] = mergedAliases
    }

    return acc
  },
  {} as Record<string, Set<string>>
)

// Convert to the final format
const grammarAliasesString = Object.entries(grammarAliases)
  .map(([scopeName, aliases]) => {
    const aliasesString = Array.from(aliases)
      .map((alias) => `'${alias}'`)
      .join(', ')
    return `  '${scopeName}': [${aliasesString}]`
  })
  .join(',\n')

// Build redirect mapping from alias scope names to target scope names
const grammarRedirects: Record<string, string[]> = {
  // Treat JavaScript / TypeScript extensions as TSX
  tsx: ['ts', 'typescript', 'js', 'javascript', 'jsx'],
  // Treat standard Markdown as MDX
  mdx: ['md', 'markdown'],
}
const redirectMap = new Map<string, string>()

for (const [targetName, aliases] of Object.entries(grammarRedirects)) {
  const targetScope = grammars.find(
    (grammar) => grammar.name === targetName
  )?.scopeName

  if (!targetScope) {
    continue
  }

  for (const aliasName of aliases) {
    const aliasScope = grammars.find((grammar) => {
      return (
        grammar.name === aliasName ||
        (grammar.aliases && grammar.aliases.includes(aliasName))
      )
    })?.scopeName

    if (aliasScope && !redirectMap.has(aliasScope)) {
      redirectMap.set(aliasScope, targetScope)
    }
  }
}

const grammarRedirectEntries = Array.from(redirectMap.entries())
  .map(([aliasScope, targetScope]) => `  '${aliasScope}': '${targetScope}'`)
  .join(',\n')
const themeNames = `export const themes = [${themes
  .map((theme) => `'${theme.name}'`)
  .join(', ')}] as const`

const fileContent = `// prettier-ignore
export const grammarLoaders: Record<string, () => Promise<{ default: any }>> = {
${grammarLoaders}
}

// prettier-ignore
export const grammarRedirects = {
${grammarRedirectEntries}
}

// prettier-ignore
export const grammars = {
${grammarAliasesString}
} as const

export type Grammars = typeof grammars

export type ScopeName = keyof Grammars

export type Languages = Grammars[ScopeName][number]

// prettier-ignore
${themeNames}

export type Themes = (typeof themes)[number]
`

writeFileSync('./src/grammars/index.ts', fileContent, 'utf-8')

await Promise.all(
  grammars
    .filter((grammar) => BUNDLED_LANGUAGES.has(grammar.name))
    .map(async (grammar) => {
      const contents = readFileSync(
        resolve(
          'node_modules',
          'tm-grammars',
          'grammars',
          `${grammar.name}.json`
        ),
        'utf-8'
      )
      writeFileSync(
        resolve('src', 'grammars', `${grammar.name}.ts`),
        toJsonModule(contents),
        'utf-8'
      )
    })
)

function toJsonModule(jsonText: string): string {
  const parsed = JSON.parse(jsonText) as any

  // Adjust embedded JS scope when inside HTML grammar
  // (these grammars embed JS; we treat it as TSX in renoun)
  if (JSON.stringify(parsed).includes('text.html.basic')) {
    deepReplaceString(parsed, 'source.js', 'source.tsx')
  }

  const precompiled = precompileGrammar(parsed)
  const precompiledString = toJsLiteral(precompiled)
  const needsEmulated = precompiledString.includes('new EmulatedRegExp(')

  return `// prettier-ignore
${needsEmulated ? "import { EmulatedRegExp } from 'oniguruma-to-es'\n" : ''}export default Object.freeze(${precompiledString})
`
}

function precompileGrammar(grammar: any): any {
  const precompiled = structuredClone(grammar)
  traverseGrammarPatterns(precompiled, (pattern) => {
    // Preserve Oniguruma anchor tokens for runtime anchor-state handling.
    // Precompiling these can drop anchor gating semantics (notably bare `\\G`).
    if (pattern.includes('\\A') || pattern.includes('\\G')) return pattern

    const details = toRegExpDetails(pattern, {
      global: true,
      hasIndices: true,
      rules: {
        allowOrphanBackrefs: true,
        asciiWordBoundaries: true,
        captureGroup: true,
        recursionLimit: 5,
        singleline: true,
      },
      target: 'ES2024',
    })

    if (details.options) {
      return new EmulatedRegExp(details.pattern, details.flags, details.options)
    }
    return new RegExp(details.pattern, details.flags)
  })
  return precompiled
}

function traverseGrammarPatterns(
  a: any,
  callback: (pattern: string) => any | void
): void {
  if (Array.isArray(a)) {
    a.forEach((j: any) => {
      traverseGrammarPatterns(j, callback)
    })
    return
  }
  if (!a || typeof a !== 'object') return

  const keys = [
    'foldingStartMarker',
    'foldingStopMarker',
    'firstLineMatch',
    'match',
    'begin',
    'end',
    'while',
  ] as const

  for (const key of keys) {
    if (typeof (a as any)[key] === 'string') {
      const pattern = callback((a as any)[key])
      if (pattern != null) (a as any)[key] = pattern
    }
  }

  if (a.patterns) {
    traverseGrammarPatterns(a.patterns, callback)
  }
  if (a.captures) {
    traverseGrammarPatterns(Object.values(a.captures), callback)
  }
  if (a.beginCaptures) {
    traverseGrammarPatterns(Object.values(a.beginCaptures), callback)
  }
  if (a.endCaptures) {
    traverseGrammarPatterns(Object.values(a.endCaptures), callback)
  }
  if (a.injections) {
    traverseGrammarPatterns(Object.values(a.injections), callback)
  }
  Object.values(a.repository || {}).forEach((j: any) => {
    traverseGrammarPatterns(j, callback)
  })
}

function deepReplaceString(node: any, from: string, to: string) {
  if (!node) return
  if (Array.isArray(node)) {
    for (const item of node) deepReplaceString(item, from, to)
    return
  }
  if (typeof node !== 'object') return
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (typeof value === 'string') {
      if (value === from) node[key] = to
    } else {
      deepReplaceString(value, from, to)
    }
  }
}

function safeKey(key: string) {
  const validIdentifier = /^[a-z_$][\\w$]*$/i
  if (validIdentifier.test(key)) return key
  return JSON.stringify(key)
}

export function toJsLiteral(value: any, seen = new Set<any>()): string {
  if (value === null) return 'null'
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'boolean' || typeof value === 'number')
    return String(value)

  if (value instanceof EmulatedRegExp) {
    return `/*@__PURE__*/ new EmulatedRegExp(${JSON.stringify(
      value.source
    )},"${value.flags}",${JSON.stringify(value.rawOptions)})`
  }

  if (value instanceof RegExp) {
    return value.toString()
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('Circular reference detected in array')
    seen.add(value)
    return `[${value.map((item) => toJsLiteral(item, seen)).join(',')}]`
  }

  if (typeof value === 'object') {
    if (seen.has(value))
      throw new Error('Circular reference detected in object')
    seen.add(value)
    const entries: string[] = []
    for (const key of Object.keys(value)) {
      entries.push(`${safeKey(key)}:${toJsLiteral(value[key], seen)}`)
    }
    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}
