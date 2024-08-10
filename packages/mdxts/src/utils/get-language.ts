import type { bundledLanguages } from 'shiki/bundle/web'

export const languageMap = {
  mjs: 'js',
} as const

export type Languages =
  | keyof typeof bundledLanguages
  | keyof typeof languageMap
  | 'plaintext'
  | 'diff'

/** Normalizes language to a specific grammar language key. */
export function getLanguage(
  language: Languages
): keyof typeof bundledLanguages {
  if (language in languageMap) {
    return languageMap[language as keyof typeof languageMap]
  }
  return language as keyof typeof bundledLanguages
}
