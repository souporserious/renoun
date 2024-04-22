import { cache } from 'react'
import Highlighter from 'textmate-highlighter'
import type { TokenProps } from './types'

const grammarMap = {
  mjs: 'javascript',
  js: 'javascript',
  ts: 'typescript',
}

type GrammarMapKey = keyof typeof grammarMap

export const highlighter = new Highlighter({
  getGrammar: (grammar: string) => {
    const language = grammar.split('.').pop()
    const finalGrammar = grammarMap[language as GrammarMapKey] || language
    return `https://unpkg.com/tm-grammars@1.6.8/grammars/${finalGrammar}.json`
  },
  getTheme: (theme: string) => {
    return `https://unpkg.com/tm-themes@1.4.0/themes/${theme}.json`
  },
  getOniguruma: () => {
    return `https://unpkg.com/vscode-oniguruma@2.0.1/release/onig.wasm`
  },
})

// TODO: create CSS variables that can be used to style the tokens, optimize function for client and only return inlined keys
// getCSSTokens({ theme: 'night-owl' })

export const getTheme = cache(async (theme: string) => {
  const response = await fetch(
    `https://unpkg.com/tm-themes@1.4.0/themes/${theme}.json`
  )
  const json = await response.json()
  const background =
    json?.colors?.['editor.background'] ||
    json?.colors?.['background'] ||
    '#000000'
  const foreground =
    json?.colors?.['editor.foreground'] ||
    json?.colors?.['foreground'] ||
    '#ffffff'

  return Object.assign(json, { background, foreground })
})

export async function getTokens(props: {
  value: string
  language: string
  theme: string
}): Promise<{
  tokens: TokenProps[][]
  background: string
  foreground: string
  lineCount: number
  maxLineLength: number
}> {
  const theme = await getTheme(props.theme)
  const tokens = (await new Promise(async (resolve) => {
    await highlighter.highlightToAbstract(
      {
        code: props.value,
        grammar: `source.${props.language}`,
        theme: props.theme,
      },
      resolve
    )
  })) as TokenProps[][]
  const lineCount = tokens.length
  const maxLineLength =
    Math.max(
      ...tokens.map((line) =>
        line.reduce((total, token) => total + token.value.length, 0)
      )
    ) + 1

  return {
    background: theme.background,
    foreground: theme.foreground,
    tokens,
    lineCount,
    maxLineLength,
  }
}
