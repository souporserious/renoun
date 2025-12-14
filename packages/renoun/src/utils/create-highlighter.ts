import type { ConfigurationOptions } from '../components/Config/types.ts'
import { Tokenizer } from './create-tokenizer.ts'
import { getGrammar } from './get-grammar.ts'
import { getTheme } from './get-theme.ts'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter(
  options: Partial<Pick<ConfigurationOptions, 'theme' | 'languages'>>
) {
  const tokenizer = new Tokenizer({
    getGrammar: (scopeName) => getGrammar(scopeName, options.languages),
    getTheme: (name) => getTheme(name, options.theme),
  })
  return tokenizer
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
