import type { Languages } from '../textmate/index.js'
import { grammars } from '../textmate/index.js'
import { createTokenizer } from './create-tokenizer.js'
import { getTheme } from './get-theme.js'
import { loadConfig } from './load-config.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  const config = loadConfig()

  return createTokenizer({
    async getGrammar(scopeName) {
      const grammar = grammars[scopeName]

      if (!grammar) {
        return null
      }

      const loader = grammar[0]
      const names = grammar.slice(1) as Languages[]

      if (
        config.languages &&
        !names.some((name) => config.languages.includes(name))
      ) {
        return null
      }

      const result = await loader()

      return result.default.at(-1)
    },
    getTheme,
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
