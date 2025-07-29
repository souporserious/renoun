import { createTokenizer } from './create-tokenizer.js'
import { getGrammar } from './get-grammar.js'
import { getTheme } from './get-theme.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  return createTokenizer({
    getGrammar,
    getTheme,
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
