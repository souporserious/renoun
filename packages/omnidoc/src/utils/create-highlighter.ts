import { getTheme } from './get-theme'

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

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  return (await import('shiki/bundle/web')).createHighlighter({
    langs: defaultLanguages,
    themes: [getTheme()],
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
