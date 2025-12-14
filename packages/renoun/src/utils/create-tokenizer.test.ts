import { describe, expect, test } from 'vitest'

import {
  Tokenizer,
  type RegistryOptions,
  type TextMateThemeRaw,
  type TextMateGrammarRaw,
} from './create-tokenizer.ts'

import cssGrammar from '../grammars/css.ts'

type ThemeName = 'light' | 'dark'

const themeFixtures: Record<ThemeName, TextMateThemeRaw> = {
  light: {
    name: 'Light',
    type: 'light',
    colors: {
      foreground: '#111111',
    },
    tokenColors: [
      {
        scope: 'comment',
        settings: {
          foreground: '#ff0000',
        },
      },
    ],
    settings: [
      {
        scope: 'comment',
        settings: {
          foreground: '#ff0000',
        },
      },
    ],
  },
  dark: {
    name: 'Dark',
    type: 'dark',
    colors: {
      foreground: '#eeeeee',
    },
    tokenColors: [
      {
        scope: 'comment',
        settings: {
          foreground: '#00ff00',
        },
      },
    ],
    settings: [
      {
        scope: 'comment',
        settings: {
          foreground: '#00ff00',
        },
      },
    ],
  },
}

const registryOptions: RegistryOptions<ThemeName> = {
  async getGrammar(scopeName) {
    if (scopeName === 'source.css') {
      return cssGrammar as TextMateGrammarRaw
    }

    throw new Error(`Missing grammar for scope: ${scopeName}`)
  },
  async getTheme(theme) {
    const themeDefinition = themeFixtures[theme]
    if (!themeDefinition) {
      throw new Error(`Missing theme: ${theme}`)
    }

    return themeDefinition
  },
}

describe('Tokenizer', () => {
  test('tokenizes multiple themes without altering merged output', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = '/* comment line 1\ncomment line 2 */'

    const multiThemeTokens = await tokenizer.tokenize(source, 'css', [
      'light',
      'dark',
    ])
    const lightOnlyTokens = await tokenizer.tokenize(source, 'css', ['light'])
    const darkOnlyTokens = await tokenizer.tokenize(source, 'css', ['dark'])

    const tokenValues = (lines: typeof multiThemeTokens) =>
      lines.map((line) => line.map((token) => token.value))

    expect(tokenValues(multiThemeTokens)).toEqual(tokenValues(lightOnlyTokens))
    expect(tokenValues(multiThemeTokens)).toEqual(tokenValues(darkOnlyTokens))

    const firstLineComment = multiThemeTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const secondLineComment = multiThemeTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )

    const firstLineLight = lightOnlyTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const firstLineDark = darkOnlyTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const secondLineLight = lightOnlyTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )
    const secondLineDark = darkOnlyTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )

    expect(firstLineComment?.style['--0fg']).toBe(firstLineLight?.style.color)
    expect(firstLineComment?.style['--1fg']).toBe(firstLineDark?.style.color)
    expect(secondLineComment?.style['--0fg']).toBe(secondLineLight?.style.color)
    expect(secondLineComment?.style['--1fg']).toBe(secondLineDark?.style.color)

    expect(firstLineComment?.style.color).toBeUndefined()
    expect(secondLineComment?.style.color).toBeUndefined()
  })

  test('streams tokenized lines without changing output', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = '/* comment line 1*/\n/* comment line 2 */'

    const streamed: string[][] = []
    for await (const line of tokenizer.stream(source, 'css', ['light'])) {
      streamed.push(line.map((token) => token.value))
    }

    const tokens = await tokenizer.tokenize(source, 'css', ['light'])
    const nonStreamed = tokens.map((line) => line.map((token) => token.value))

    expect(streamed).toEqual(nonStreamed)
  })

  test('retrieves grammar state and reuses it across tokenization runs', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const firstChunk = '/* comment line 1'
    const secondChunk = 'comment line 2 */'

    const firstTokens = await tokenizer.tokenize(firstChunk, 'css', ['light'])
    const grammarState = tokenizer.getGrammarState()

    expect(grammarState).toBeDefined()

    const secondTokens = await tokenizer.tokenize(
      secondChunk,
      'css',
      ['light'],
      { grammarState }
    )

    const incremental = [...firstTokens, ...secondTokens].map((line) =>
      line.map((token) => token.value)
    )

    const fullTokens = await tokenizer.tokenize(
      `${firstChunk}\n${secondChunk}`,
      'css',
      ['light']
    )
    const complete = fullTokens.map((line) => line.map((token) => token.value))

    expect(incremental).toEqual(complete)
  })
})
