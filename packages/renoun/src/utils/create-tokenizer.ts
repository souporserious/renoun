import type {
  IGrammar,
  IRawGrammar,
  IRawTheme,
  StateStack,
} from 'vscode-textmate'
import TextMate from 'vscode-textmate'
import { toRegExp } from 'oniguruma-to-es'

import type { Languages, ScopeName } from '../grammars/index.js'
import { grammars } from '../grammars/index.js'

export interface RegistryOptions<Theme extends string> {
  getGrammar: (scopeName: ScopeName) => Promise<TextMateGrammarRaw>
  getTheme: (theme: Theme) => Promise<TextMateThemeRaw>
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
  [key: string]: string | undefined
}

export interface TextMateToken {
  value: string
  start: number
  end: number
  style: TextMateTokenStyle
  hasTextStyles: boolean
  isBaseColor: boolean
  isWhiteSpace: boolean
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

export class Registry<Theme extends string> {
  #options: RegistryOptions<Theme>
  #registry: TextMateRegistry<ScopeName>
  #theme: TextMateThemeRaw | undefined

  constructor(options: RegistryOptions<Theme>) {
    this.#options = options
    this.#registry = new TextMate.Registry({
      onigLib,
      loadGrammar: this.fetchGrammar,
    })
  }

  fetchGrammar = async (
    scopeName: ScopeName
  ): Promise<GrammarMetadata | null> => {
    const source = await this.#options.getGrammar(scopeName)
    if (!source) {
      return null
    }
    return source
  }

  async loadGrammar(language: Languages): Promise<TextMateGrammar | null> {
    let scopeName = Object.keys(grammars).find((scopeName) =>
      (grammars[scopeName as ScopeName] as readonly Languages[]).includes(
        language
      )
    ) as ScopeName | undefined

    if (!scopeName) {
      throw new Error(
        `[renoun] The grammar for language "${language}" could not be found. Ensure this language is configured in renoun.json correctly.`
      )
    }

    return this.#registry.loadGrammar(scopeName)
  }

  async fetchTheme(name: Theme): Promise<TextMateThemeRaw> {
    const source = await this.#options.getTheme(name)

    if (!source) {
      throw new Error(
        `[renoun] Missing "${name}" theme in Registry. Ensure this theme is configured in renoun.json correctly and the \`tm-themes\` package is installed.`
      )
    }

    return source
  }

  setTheme(theme: TextMateThemeRaw): void {
    if (this.#theme === theme) return
    this.#theme = theme
    this.#registry.setTheme(theme)
  }

  getThemeColors(): string[] {
    return this.#registry.getColorMap()
  }
}

const FontStyle = {
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
}

export class Tokenizer<Theme extends string> {
  #baseColors: Map<string, string> = new Map()
  #registries: Map<string, Registry<Theme>> = new Map()
  #registryOptions: RegistryOptions<Theme>

  constructor(registryOptions: RegistryOptions<Theme>) {
    this.#registryOptions = registryOptions
  }

  /** Tokenize the given source for multiple themes. */
  tokenize = async (
    source: string,
    language: Languages,
    themes: Theme[],
    timeLimit?: number
  ): Promise<TextMateToken[][]> => {
    const lines = source.split(/\r?\n/)
    const useCssVariables = themes.length > 1
    const themeGrammars: (TextMateGrammar | null)[] = []
    const themeColorMaps: string[][] = []
    const states: StateStack[] = []

    // Manage a registry for each theme to ensure that each theme has its own state
    for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
      const themeName = themes[themeIndex]

      let registry = this.#registries.get(themeName)
      if (!registry) {
        registry = new Registry(this.#registryOptions)
        const theme = await registry.fetchTheme(themeName)
        registry.setTheme(theme)
        this.#baseColors.set(themeName, theme.colors!['foreground'])
        this.#registries.set(themeName, registry)
      }

      const loadedGrammar = await registry
        .loadGrammar(language)
        .catch((error) => {
          throw new Error(
            `[renoun] Grammar could not be loaded for language "${language}". Ensure this language is configured in renoun.json correctly.`,
            { cause: error }
          )
        })

      if (loadedGrammar) {
        themeGrammars[themeIndex] = loadedGrammar
      }

      if (!themeGrammars[themeIndex]) {
        throw new Error(
          `[renoun] Could not load grammar for language: ${language}`
        )
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
        const style: Partial<TextMateTokenStyle> = {}
        let isBaseColor = true
        let hasTextStyles = false

        for (const token of allTokens) {
          const baseColor = this.#baseColors.get(themes[token.themeIndex])!

          if (token.start < rangeEnd && token.end > rangeStart) {
            const { bits } = token
            const colorBits = (bits & 0b00000000111111111000000000000000) >>> 15
            const colorMap = themeColorMaps[token.themeIndex]
            const color = colorMap[colorBits] || ''
            const fontFlags = (bits >>> 11) & 0b1111
            const fontStyle = fontFlags & FontStyle.Italic ? 'italic' : ''
            const fontWeight = fontFlags & FontStyle.Bold ? 'bold' : ''
            let textDecoration = ''

            if (fontFlags & FontStyle.Underline) {
              textDecoration += 'underline'
            }
            if (fontFlags & FontStyle.Strikethrough) {
              if (textDecoration) {
                textDecoration += ' '
              }
              textDecoration += 'line-through'
            }

            if (baseColor.toLowerCase() !== color.toLowerCase()) {
              isBaseColor = false
            }

            if (fontFlags !== 0) {
              hasTextStyles = true
            }

            if (useCssVariables) {
              const themeKey = '--' + token.themeIndex
              if (color && !isBaseColor) style[themeKey + 'fg'] = color
              if (fontStyle) style[themeKey + 'fs'] = fontStyle
              if (fontWeight) style[themeKey + 'fw'] = fontWeight
              if (textDecoration) style[themeKey + 'td'] = textDecoration
            } else {
              if (color && !isBaseColor) style.color = color
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
          style: style as TextMateTokenStyle,
          hasTextStyles,
          isBaseColor,
          isWhiteSpace: /^\s*$/.test(value),
        })
      }

      mergedLines.push(mergedLineTokens)
    }

    return mergedLines
  }
}

export function createTokenizer<Theme extends string>(
  options: RegistryOptions<Theme>
): Tokenizer<Theme>['tokenize'] {
  const tokenizer = new Tokenizer(options)
  return tokenizer.tokenize
}
