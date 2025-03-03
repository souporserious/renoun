import type {
  IGrammar,
  IRawGrammar,
  IRawTheme,
  StateStack,
} from 'vscode-textmate'
import TextMate from 'vscode-textmate'
import { toRegExp } from 'oniguruma-to-es'

import { grammars } from '../grammars/index.js'

export interface RegistryOptions<Grammar extends string, Theme extends string> {
  getGrammar: (grammar: Grammar) => Promise<TextMateGrammarRaw | string>
  getTheme: (theme: Theme) => Promise<TextMateThemeRaw | string>
}

export type TextMateGrammar = IGrammar
export type TextMateGrammarRaw = IRawGrammar

export type TextMateRegistry<Grammar extends string> = {
  getColorMap: () => string[]
  loadGrammar: (grammar: Grammar) => Promise<TextMateGrammar | null>
  setTheme: (theme: TextMateThemeRaw) => void
}

export type TextMateThemeRaw = IRawTheme & {
  type?: 'dark' | 'light'
  colors?: Record<string, string>
  semanticTokenColors?: Record<string, TextMateTokenSettings>
  tokenColors?: TextMateTokenColor[]
  settings?: IRawTheme['settings']
}

export interface TextMateTokenColor {
  name?: string
  scope: string | string[]
  settings: TextMateTokenSettings
}

export interface TextMateTokenSettings {
  foreground?: string
  background?: string
  fontStyle?: string
}

export interface TextMateTokenStyle {
  color: string
  backgroundColor: string
  fontStyle: string
  fontWeight: string
  textDecoration: string
}

export interface TextMateToken {
  value: string
  start: number
  end: number
  style: Record<string, string>
}

class JsOnigScanner {
  #regexes: RegExp[]

  constructor(patterns: string[]) {
    this.#regexes = patterns.map((pattern) =>
      toRegExp(pattern, {
        global: true,
        hasIndices: true,
        lazyCompileLength: 3000,
        rules: {
          allowOrphanBackrefs: true,
          asciiWordBoundaries: true,
          captureGroup: true,
          recursionLimit: 5,
          singleline: true,
        },
        target: 'auto',
      })
    )
  }

  findNextMatchSync(
    text: string | { toString(): string },
    startPosition: number
  ): any {
    const stringText = typeof text === 'string' ? text : text.toString()
    if (startPosition < 0) {
      startPosition = 0
    }
    let bestMatch: RegExpExecArray | null = null
    let bestPatternIndex = -1

    // Use the full text and set lastIndex to startPosition
    for (let index = 0; index < this.#regexes.length; index++) {
      const regex = this.#regexes[index]
      regex.lastIndex = startPosition
      const match = regex.exec(stringText)
      if (match && (bestMatch === null || match.index < bestMatch.index)) {
        bestMatch = match
        bestPatternIndex = index
        if (match.index === startPosition) break
      }
    }

    if (!bestMatch) {
      return null
    }

    const result: {
      index: number
      captureIndices: { start: number; end: number; length: number }[]
    } = {
      index: bestPatternIndex,
      captureIndices: [],
    }

    // If indices are provided by the regex engine, use them directly.
    if (bestMatch.indices) {
      const indices: Array<[number, number] | undefined> = bestMatch.indices
      result.captureIndices = indices.map((pair) => {
        if (!pair) {
          return { start: -1, end: -1, length: -1 }
        }
        return { start: pair[0], end: pair[1], length: pair[1] - pair[0] }
      })
      return result
    }

    // Fallback to manually computing capture indices which is less reliable
    const fullMatchIndex = bestMatch.index
    const fullMatchText = bestMatch[0]

    result.captureIndices.push({
      start: fullMatchIndex,
      end: fullMatchIndex + fullMatchText.length,
      length: fullMatchText.length,
    })

    let currentIndex = 0

    for (let index = 1; index < bestMatch.length; index++) {
      const groupText = bestMatch[index]
      if (groupText == null) {
        result.captureIndices.push({ start: -1, end: -1, length: -1 })
        continue
      }
      const groupIndex = fullMatchText.indexOf(groupText, currentIndex)
      if (groupIndex >= 0) {
        const start = fullMatchIndex + groupIndex
        const end = start + groupText.length
        result.captureIndices.push({
          start,
          end,
          length: groupText.length,
        })
        currentIndex = groupIndex + groupText.length
      } else {
        result.captureIndices.push({ start: -1, end: -1, length: -1 })
      }
    }

    return result
  }
}

class JsOnigString {
  content: string
  constructor(content: string) {
    this.content = content
  }
  toString(): string {
    return this.content
  }
}

const onigLib = Promise.resolve({
  createOnigScanner: (patterns: string[]) => new JsOnigScanner(patterns),
  createOnigString: (string: string) => new JsOnigString(string),
})

interface GrammarMetadata extends IRawGrammar {
  name?: string
  aliases?: string[]
}

export class Registry<Grammar extends string, Theme extends string> {
  #options: RegistryOptions<Grammar, Theme>
  #registry: TextMateRegistry<Grammar>
  #theme: TextMateThemeRaw | undefined

  constructor(options: RegistryOptions<Grammar, Theme>) {
    this.#options = options
    this.#registry = new TextMate.Registry({
      onigLib,
      loadGrammar: this.fetchGrammar,
    })
  }

  fetchGrammar = async (name: Grammar): Promise<GrammarMetadata | null> => {
    const source = await this.#options.getGrammar(name)
    let grammar: GrammarMetadata

    if (typeof source === 'string') {
      grammar = await (await fetch(source)).json()
    } else if (source) {
      grammar = source
    } else {
      return null
    }

    return grammar
  }

  fetchTheme = async (name: Theme): Promise<TextMateThemeRaw> => {
    const source = await this.#options.getTheme(name)
    if (typeof source === 'string') {
      return await (await fetch(source)).json()
    } else if (source) {
      return source
    }
    throw new Error(`Missing theme: "${name}"`)
  }

  loadGrammar = async (name: Grammar): Promise<TextMateGrammar | null> => {
    const scopeName = Object.keys(grammars).find((scopeName) =>
      grammars[scopeName].slice(1).includes(name)
    ) as Grammar

    return this.#registry.loadGrammar(scopeName || name)
  }

  loadTheme = async (name: Theme): Promise<TextMateThemeRaw> => {
    const theme = await this.fetchTheme(name)
    return this.normalizeTheme(theme)
  }

  getThemeColors = (): string[] => {
    return this.#registry.getColorMap()
  }

  normalizeTheme = async function (
    theme: TextMateThemeRaw
  ): Promise<TextMateThemeRaw> {
    if (!theme.settings) {
      if (theme.tokenColors) {
        theme.settings = theme.tokenColors
      } else {
        theme.settings = []
      }
    }
    return theme
  }

  setTheme = (theme: TextMateThemeRaw): void => {
    if (this.#theme === theme) return
    this.#theme = theme
    this.#registry.setTheme(theme)
  }
}

const fontStyles = ['', 'italic', '', '', '']
const fontWeights = ['', '', 'bold', '', '']
const textDecorations = ['', '', '', '', 'underline']

export class Tokenizer<Grammar extends string, Theme extends string> {
  private registries: Map<string, Registry<Grammar, Theme>> = new Map()
  private registryOptions: RegistryOptions<Grammar, Theme>

  constructor(registryOptions: RegistryOptions<Grammar, Theme>) {
    this.registryOptions = registryOptions
  }

  /** Tokenize the given source for multiple themes. */
  tokenize = async (
    source: string,
    grammar: Grammar,
    themes: Theme[],
    timeLimit?: number
  ): Promise<TextMateToken[][]> => {
    const lines = source.split(/\r?\n/)
    const useCssVariables = themes.length > 1
    const themeGrammars: (TextMateGrammar | null)[] = []
    const themeColorMaps: string[][] = []
    const states: StateStack[] = []

    for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
      const theme = themes[themeIndex]

      let registry = this.registries.get(theme)
      if (!registry) {
        registry = new Registry(this.registryOptions)
        registry.setTheme(await registry.loadTheme(theme))
        this.registries.set(theme, registry)
      }

      const loadedGrammar = await registry.loadGrammar(grammar)

      if (loadedGrammar) {
        themeGrammars[themeIndex] = loadedGrammar
      }

      if (!themeGrammars[themeIndex]) {
        throw new Error(`Could not load grammar: ${grammar}`)
      }

      themeColorMaps[themeIndex] = registry.getThemeColors()
      states[themeIndex] = TextMate.INITIAL
    }

    const mergedLines: TextMateToken[][] = []

    for (const lineText of lines) {
      const allTokens: Array<{
        start: number
        end: number
        bits: number
        themeIndex: number
      }> = []
      const boundarySet = new Set<number>()

      for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
        const grammar = themeGrammars[themeIndex]

        if (!grammar) {
          continue
        }

        const lineResult = grammar.tokenizeLine2(
          lineText,
          states[themeIndex],
          timeLimit
        )
        states[themeIndex] = lineResult.ruleStack

        const tokenData = lineResult.tokens

        for (
          let tokenDataIndex = 0;
          tokenDataIndex < tokenData.length;
          tokenDataIndex += 2
        ) {
          const startOffset = tokenData[tokenDataIndex]
          const endOffset =
            tokenDataIndex + 2 < tokenData.length
              ? tokenData[tokenDataIndex + 2]
              : lineText.length

          allTokens.push({
            start: startOffset,
            end: endOffset,
            bits: tokenData[tokenDataIndex + 1],
            themeIndex,
          })
          boundarySet.add(startOffset)
          boundarySet.add(endOffset)
        }
      }

      // Sort the collected boundaries so we can iterate from left to right
      const boundaries = Array.from(boundarySet).sort((a, b) => a - b)
      const mergedLineTokens: TextMateToken[] = []

      for (let boundary = 0; boundary < boundaries.length - 1; boundary++) {
        const rangeStart = boundaries[boundary]
        const rangeEnd = boundaries[boundary + 1]

        if (rangeStart >= rangeEnd) {
          continue
        }

        const value = lineText.slice(rangeStart, rangeEnd)

        // Merge style bits from all tokens that overlap this boundary range
        const style: Record<string, string> = {}

        for (const token of allTokens) {
          if (token.start < rangeEnd && token.end > rangeStart) {
            const colorMap = themeColorMaps[token.themeIndex]
            const { bits } = token

            const colorBits = (bits & 0b00000000111111111000000000000000) >>> 15
            const color = colorMap[colorBits] || ''

            const fontBits = (bits & 0b00000000000000000011100000000000) >>> 11
            const fontStyle = fontStyles[fontBits]
            const fontWeight = fontWeights[fontBits]
            const textDecoration = textDecorations[fontBits]

            if (useCssVariables) {
              const themeKey = '--' + token.themeIndex
              if (color) style[themeKey + 'fg'] = color
              if (fontStyle) style[themeKey + 'fs'] = fontStyle
              if (fontWeight) style[themeKey + 'fw'] = fontWeight
              if (textDecoration) style[themeKey + 'td'] = textDecoration
            } else {
              if (color) style.color = color
              if (fontStyle) style.fontStyle = fontStyle
              if (fontWeight) style.fontWeight = fontWeight
              if (textDecoration) style.textDecoration = textDecoration
            }
          }
        }

        mergedLineTokens.push({
          value,
          start: rangeStart,
          end: rangeEnd,
          style,
        })
      }

      mergedLines.push(mergedLineTokens)
    }

    return mergedLines
  }
}

export function createTokenizer<Grammar extends string, Theme extends string>(
  options: RegistryOptions<Grammar, Theme>
): Tokenizer<Grammar, Theme>['tokenize'] {
  const tokenizer = new Tokenizer(options)
  return tokenizer.tokenize
}
