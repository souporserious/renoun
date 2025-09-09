import type { ConfigurationOptions } from '../components/Config/ConfigTypes.js'
import { createTokenizer } from './create-tokenizer.js'
import { getGrammar } from './get-grammar.js'
import { getTheme } from './get-theme.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter(
  options: Partial<Pick<ConfigurationOptions, 'theme' | 'languages'>>
) {
  return createTokenizer({
    getGrammar: (scopeName) => getGrammar(scopeName, options.languages),
    getTheme: (name) => getTheme(name, options.theme),
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
