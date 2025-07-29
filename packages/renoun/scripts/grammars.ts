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
const grammarAliases = grammars
  .map((grammar) => {
    const mergedAliases = new Set<string>([
      grammar.name,
      ...(grammar.aliases || []),
    ])
    const aliasesString = Array.from(mergedAliases)
      .map((alias) => `'${alias}'`)
      .join(', ')
    return `  '${grammar.scopeName}': [${aliasesString}]`
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
${grammarAliases}
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

function toJsonModule(content: any): string {
  if (content.includes('text.html.basic')) {
    // we use the tsx grammar to highlight HTML javascript so we need to change the embedded scope
    content = content.replaceAll('source.js', 'source.tsx')
  }

  return `export default Object.freeze(
  JSON.parse(
    ${JSON.stringify(content)}
  )
)
`
}
