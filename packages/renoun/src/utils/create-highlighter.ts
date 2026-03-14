import type { HighlighterInitializationOptions } from './highlighter-options.ts'
import { Tokenizer } from './create-tokenizer.ts'
import { getGrammar } from './get-grammar.ts'
import { getTheme } from './get-theme.ts'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter(
  options: HighlighterInitializationOptions
) {
  const tokenizer = new Tokenizer({
    getGrammar: (scopeName) => getGrammar(scopeName, options.languages),
    getTheme: (name) => getTheme(name, options.theme),
  })
  return tokenizer
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
