import { existsSync, readFileSync } from 'node:fs'

import { getRenounFilePath } from './get-renoun-file-path.js'
import { createTokenizer } from './create-tokenizer.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  return createTokenizer({
    getAliases: () => {
      const metaPath = getRenounFilePath('languages', 'meta.json')

      if (!existsSync(metaPath)) {
        throw new Error(`Missing language grammar meta file.`)
      }

      return JSON.parse(readFileSync(metaPath, 'utf-8'))
    },
    async getGrammar(name) {
      const aliases = Object.entries(this.getAliases())
        .find(([key]) => key === name)
        ?.at(1)

      if (!aliases) {
        throw new Error(
          `Missing language grammar for "${name}", run "renoun language ${name}" in your terminal to download and configure this language for your project.`
        )
      }

      const language = aliases[0]
      const languagePath = getRenounFilePath('languages', `${language}.json`)

      if (!existsSync(languagePath)) {
        throw new Error(
          `Missing language grammar for "${language}", run "renoun language ${name}" in your terminal to download and configure this language for your project.`
        )
      }

      return JSON.parse(readFileSync(languagePath, 'utf-8'))
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
