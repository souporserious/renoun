import { grammars } from 'tm-grammars'
import { themes } from 'tm-themes'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BUNDLED_LANGUAGES = new Set<string>([
  'css',
  'html',
  'json',
  'mdx',
  'shellscript',
  'tsx',
])
const grammarLoaders = grammars
  .filter((grammar) => BUNDLED_LANGUAGES.has(grammar.name))
  .map((grammar) => {
    const importString = `() => import('./${grammar.name}.js')`
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
  // Minify JSON to strip whitespace
  jsonText = JSON.stringify(JSON.parse(jsonText))

  // Adjust embedded JS scope when inside HTML grammar
  if (jsonText.includes('text.html.basic')) {
    jsonText = jsonText.replaceAll('source.js', 'source.tsx')
  }

  const singleQuoted = `'${jsonText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`

  return `export default Object.freeze(
  JSON.parse(
    ${singleQuoted}
  )
)
`
}
