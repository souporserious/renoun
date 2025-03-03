import { existsSync, readFileSync } from 'node:fs'

import { grammars } from '../grammars/index.js'
import { getRenounFilePath } from './get-renoun-file-path.js'
import { createTokenizer } from './create-tokenizer.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  return createTokenizer({
    async getGrammar(name) {
      const grammar = grammars[name]

      if (!grammar) {
        throw new Error(
          `Missing language grammar for scope "${name}", run "renoun language ${name}" in your terminal to download and configure this language for your project.`
        )
      }

      const loader = grammar[0]

      return loader.call(null).then((module) => module.default)
    },
    getTheme: async (name) => {
      const themePath = getRenounFilePath('themes', `${name}.json`)

      if (!existsSync(themePath)) {
        throw new Error(
          `Missing theme for "${name}", run "renoun theme ${name}" in your terminal to download and configure this theme for your project.`
        )
      }

      return JSON.parse(readFileSync(themePath, 'utf-8'))
    },
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
