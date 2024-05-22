import { getHighlighter as getShikiHighlighter } from 'shiki/bundle/web'
import type {
  BundledLanguage,
  LanguageInput,
  SpecialLanguage,
} from 'shiki/bundle/web'

import { getTheme } from '../../utils/get-theme'

const defaultLanguages = [
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'md',
  'mdx',
  'sh',
  'json',
  'html',
]
let highlighter: Awaited<ReturnType<typeof getShikiHighlighter>> | null = null

/** Converts a string of code to an array of highlighted tokens. */
export async function getHighlighter() {
  if (highlighter === null) {
    highlighter = await getShikiHighlighter({
      langs: defaultLanguages,
      themes: [getTheme()],
    })
  }

  return highlighter
}

/** Loads a language for syntax highlighting. See [shiki](https://shiki.style/guide/load-lang) for more information. */
export async function loadHighlighterLanguage(
  language: BundledLanguage | LanguageInput | SpecialLanguage
) {
  return getHighlighter().then((highlighter) =>
    highlighter.loadLanguage(language)
  )
}
