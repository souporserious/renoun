import { grammars } from 'tm-grammars'
import { themes } from 'tm-themes'
import { writeFileSync } from 'node:fs'

const grammarEntries = grammars
  .map((grammar) => {
    const importString = `() => import('@shikijs/langs/${grammar.name}')`
    const aliasesString = grammar.aliases
      ? [grammar.name, ...grammar.aliases]
          .map((alias) => `'${alias}'`)
          .join(', ')
      : `'${grammar.name}'`
    return `  '${grammar.scopeName}': [${importString}, ${aliasesString}]`
  })
  .join(',\n')
const allGrammarNames = new Set(
  grammars.flatMap((grammar) => [grammar.name, ...(grammar.aliases || [])])
)
const languagesType = `export type Languages = ${[...allGrammarNames]
  .map((name) => `'${name}'`)
  .join(' | ')}
`
const themeEntries = themes
  .map((theme) => {
    return `  '${theme.name}': () => import('@shikijs/themes/${theme.name}')`
  })
  .join(',\n')
const themeType = `export type Themes = ${themes
  .map((theme) => `'${theme.name}'`)
  .join(' | ')}
`
const fileContent = `// prettier-ignore
export const grammars: Record<string, [() => Promise<{ default: any }>, ...string[]]> = {
${grammarEntries}
}

// prettier-ignore
${languagesType}

// prettier-ignore
export const themes: Record<string, () => Promise<{ default: any }>> = {
${themeEntries}
}

// prettier-ignore
${themeType}
`

writeFileSync('./src/textmate/index.ts', fileContent, 'utf-8')
