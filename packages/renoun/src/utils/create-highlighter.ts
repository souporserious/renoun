import { grammars } from '../textmate/index.js'
import { createTokenizer } from './create-tokenizer.js'
import { getTheme } from './get-theme.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  return createTokenizer({
    async getGrammar(name) {
      const grammar = grammars[name]

      if (!grammar) {
        return null
      }

      const loader = grammar[0]
      const result = await loader()

      return result.default.at(-1)
    },
    getTheme,
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
