import { grammars } from 'tm-grammars'
import { writeFileSync } from 'node:fs'

const mapEntries = grammars
  .map((grammar) => {
    const importString = `() => import('tm-grammars/grammars/${grammar.name}.json', { with: { type: 'json' } })`
    const aliasesString = grammar.aliases
      ? [grammar.name]
          .concat(grammar.aliases)
          .map((alias) => `'${alias}'`)
          .join(', ')
      : `'${grammar.name}'`
    return `  '${grammar.scopeName}': [${importString}, ${aliasesString}]`
  })
  .join(',\n')
const fileContent = `// prettier-ignore\nexport const grammars: Record<string, [() => Promise<{ default: any }>, ...string[]]> = {
${mapEntries}
}\n`

writeFileSync('./src/grammars/index.ts', fileContent, 'utf-8')
