import { getTheme } from './get-theme.js'
import { loadConfig } from './load-config.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  const config = loadConfig()
  const { createJavaScriptRegexEngine } = await import(
    'shiki/engine/javascript'
  )

  return (await import('shiki/bundle/web')).createHighlighter({
    langs: config.languages,
    themes: [getTheme(), 'vitesse-light', 'vitesse-dark'],
    engine: createJavaScriptRegexEngine(),
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
