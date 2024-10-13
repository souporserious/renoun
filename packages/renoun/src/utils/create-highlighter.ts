import { getTheme } from './get-theme.js'
import { loadConfig } from './load-config.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  const config = loadConfig()

  return (await import('shiki/bundle/web')).createHighlighter({
    langs: config.languages,
    themes: [getTheme()],
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
