import type { Languages as TextMateLanguages } from '../grammars/index.js'

export const languageMap = {
  mjs: 'js',
} as const

export type PlainTextLanguage = 'plaintext' | 'text' | 'txt'

export type Languages = TextMateLanguages | PlainTextLanguage | 'diff'

/** Normalizes language to a specific grammar language key. */
export function getLanguage(language: Languages): Languages {
  if (language in languageMap) {
    return languageMap[language as keyof typeof languageMap]
  }
  return language as Languages
}
