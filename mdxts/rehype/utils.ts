import * as shiki from 'shiki'

export type Languages = shiki.Lang[]

export function getLanguage(className: string[] = []) {
  const language = className.find((name) => name.startsWith('language-'))
  return (language ? language.slice(9) : null) as Languages[number] | null
}
