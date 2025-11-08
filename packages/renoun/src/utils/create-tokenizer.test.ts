import { describe, expect, test } from 'vitest'

import {
  createTokenizer,
  type RegistryOptions,
  type TextMateThemeRaw,
  type TextMateGrammarRaw,
} from './create-tokenizer.js'

import cssGrammar from '../grammars/css.js'

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

describe('createTokenizer', () => {
  test('tokenizes multiple themes without altering merged output', async () => {
    const tokenize = createTokenizer<ThemeName>(registryOptions)
    const source = '/* comment line 1\ncomment line 2 */'

    const multiThemeTokens = await tokenize(source, 'css', ['light', 'dark'])
    const lightOnlyTokens = await tokenize(source, 'css', ['light'])
    const darkOnlyTokens = await tokenize(source, 'css', ['dark'])

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
})
