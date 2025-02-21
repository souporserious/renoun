import { getTheme } from './get-theme.js'
import { loadConfig } from './load-config.js'

/** Converts a string of code to an array of highlighted tokens. */
export async function createHighlighter() {
  const config = loadConfig()
  const { createJavaScriptRegexEngine } = await import(
    'shiki/engine/javascript'
  )
  let themes

  if (typeof config.theme === 'string') {
    themes = [await getTheme(config.theme)]
  } else {
    themes = await Promise.all(
      Object.entries(config.theme).map(([name, theme]) =>
        theme.endsWith('.json') ? getTheme(name) : theme
      )
    )
  }

  return (await import('shiki/bundle/web')).createHighlighter({
    engine: createJavaScriptRegexEngine(),
    langs: config.languages,
    themes,
  })
}

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
