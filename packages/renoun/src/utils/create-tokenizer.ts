import type { IGrammar, IRawGrammar, IRawTheme } from 'vscode-textmate'
import { TextEncoder } from 'node:util'

import type { Languages, ScopeName } from '../grammars/index.js'
import { grammars } from '../grammars/index.js'
import { initializeWorkerGrammars, runTokenizeJob } from './worker-pool.js'

export interface RegistryOptions<Theme extends string> {
  getGrammar: (scopeName: ScopeName) => Promise<TextMateGrammarRaw>
  getTheme: (theme: Theme) => Promise<TextMateThemeRaw>
}

export type TextMateGrammar = IGrammar

export type TextMateGrammarRaw = IRawGrammar

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

const LANGUAGE_TO_SCOPE: Record<Languages, ScopeName> = (() => {
  const map = Object.create(null) as Record<Languages, ScopeName>
  for (const name of Object.keys(grammars) as ScopeName[]) {
    const langs = grammars[name] as readonly Languages[]
    for (const lang of langs) {
      ;(map as any)[lang] = name
    }
  }
  return map
})()

export class Tokenizer<Theme extends string> {
  #registryOptions: RegistryOptions<Theme>
  #initializedScopes: Set<ScopeName>

  constructor(registryOptions: RegistryOptions<Theme>) {
    this.#registryOptions = registryOptions
    this.#initializedScopes = new Set()
  }

  tokenize = async (
    source: string,
    language: Languages,
    themes: Theme[],
    timeLimit?: number
  ): Promise<TextMateToken[][]> => {
    const useCssVariables = themes.length > 1

    const scopeName = LANGUAGE_TO_SCOPE[language]

    if (!scopeName) {
      throw new Error(
        `[renoun] The grammar for language "${language}" could not be found. Ensure this language is configured in renoun.json correctly.`
      )
    }

    // Ensure the worker has this grammar loaded once
    if (!this.#initializedScopes.has(scopeName)) {
      const grammar = await this.#registryOptions.getGrammar(scopeName)
      if (!grammar) {
        throw new Error(
          `[renoun] Could not load grammar for language: ${language}`
        )
      }
      await initializeWorkerGrammars({ [scopeName]: grammar })
      this.#initializedScopes.add(scopeName)
    }

    const themeSources = await Promise.all(
      themes.map((t) => this.#registryOptions.getTheme(t))
    )
    themeSources.forEach((themeSource, index) => {
      if (!themeSource) {
        throw new Error(
          `[renoun] Missing "${themes[index]!}" theme in Registry. Ensure this theme is configured in renoun.json correctly and the \`tm-themes\` package is installed.`
        )
      }
    })

    // Prepare source once
    const lines = source.split(/\r?\n/)
    const encoder = new TextEncoder()
    const uint8 = encoder.encode(source)
    const sourceBuffer = new ArrayBuffer(uint8.byteLength)
    new Uint8Array(sourceBuffer).set(uint8)

    // Tokenize per theme using tokenizeLine2 in the worker
    const themeResults = await Promise.all(
      themeSources.map((themeSource) => {
        // Create a fresh transferable buffer per job to prevent reuse of a detached buffer
        const perThemeBuffer = new ArrayBuffer(uint8.byteLength)
        new Uint8Array(perThemeBuffer).set(uint8)
        return runTokenizeJob({
          scopeName,
          sourceBuffer: perThemeBuffer,
          timeLimit,
          theme: themeSource,
        })
      })
    )

    const themeColorMaps = themeResults.map((r) => r.colorMap || [])
    const baseColors = themeResults.map((r) =>
      (r.baseColor || '').toLowerCase()
    )

    type EncodedToken = { start: number; end: number; bits: number }

    // Fast path: single theme, no boundary merge needed
    if (themes.length === 1) {
      const tokensPerLine = themeResults[0]!.tokens!
      const colorMap = themeColorMaps[0]!
      const baseColorLower = baseColors[0]!
      const singleThemeLines: TextMateToken[][] = []

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineText = lines[lineIndex]!
        const encodedTokens = tokensPerLine[lineIndex]!
        const lineOutput: TextMateToken[] = []

        for (const token of encodedTokens) {
          const value = lineText.slice(token.start, token.end)
          const isWhiteSpace = /^\s*$/.test(value)

          let isBaseColor = true
          let hasTextStyles = false
          let style: Partial<TextMateTokenStyle> | undefined

          if (!isWhiteSpace) {
            const tokenBits = token.bits
            const colorBits =
              (tokenBits & 0b00000000111111111000000000000000) >>> 15
            const color = colorMap[colorBits] || ''
            const fontFlags = (tokenBits >>> 11) & 0b1111
            const fontStyle = fontFlags & 1 ? 'italic' : ''
            const fontWeight = fontFlags & 2 ? 'bold' : ''
            let textDecoration = ''
            if (fontFlags & 4) textDecoration += 'underline'
            if (fontFlags & 8)
              textDecoration += (textDecoration ? ' ' : '') + 'line-through'

            const colorLower = color.toLowerCase()
            if (colorLower && colorLower !== baseColorLower) isBaseColor = false
            if (fontFlags !== 0) hasTextStyles = true

            if (colorLower && colorLower !== baseColorLower) {
              ;(style || (style = {})).color = color
            }
            if (fontStyle) {
              ;(style || (style = {})).fontStyle = fontStyle
            }
            if (fontWeight) {
              ;(style || (style = {})).fontWeight = fontWeight
            }
            if (textDecoration) {
              ;(style || (style = {})).textDecoration = textDecoration
            }
          }

          lineOutput.push({
            value,
            start: token.start,
            end: token.end,
            style: (style || {}) as TextMateTokenStyle,
            hasTextStyles,
            isBaseColor,
            isWhiteSpace,
          })
        }

        singleThemeLines.push(lineOutput)
      }

      return singleThemeLines
    }

    const mergedLines: TextMateToken[][] = []

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex]!
      const mergedLineTokens: TextMateToken[] = []

      // Prepare per-theme token streams and pointers
      const perThemeTokens = themeResults.map(
        (r) => r.tokens![lineIndex] as EncodedToken[]
      )
      const perThemePointers = new Array(perThemeTokens.length).fill(0)

      let currentPosition = 0
      const lineLength = lineText.length

      while (currentPosition < lineLength) {
        // Determine next boundary across all themes from current position
        let nextBoundary = lineLength

        for (
          let themeIndex = 0;
          themeIndex < perThemeTokens.length;
          themeIndex++
        ) {
          const tokens = perThemeTokens[themeIndex]!
          let tokenPointer = perThemePointers[themeIndex]!

          // Advance pointer past tokens that end before or at currentPosition
          while (
            tokenPointer < tokens.length &&
            tokens[tokenPointer]!.end <= currentPosition
          ) {
            tokenPointer++
          }
          perThemePointers[themeIndex] = tokenPointer

          if (tokenPointer < tokens.length) {
            const token = tokens[tokenPointer]!
            // If token starts after current position, the next boundary is the start; otherwise it's the end
            const candidateBoundary =
              token.start > currentPosition ? token.start : token.end
            if (candidateBoundary < nextBoundary)
              nextBoundary = candidateBoundary
          }
        }

        if (nextBoundary <= currentPosition) {
          // Safety valve to prevent infinite loop
          break
        }

        const value = lineText.slice(currentPosition, nextBoundary)
        const isWhiteSpace = /^\s*$/.test(value)
        let isBaseColor = true
        let hasTextStyles = false
        let style: Partial<TextMateTokenStyle> | undefined

        if (!isWhiteSpace) {
          for (
            let themeIndex = 0;
            themeIndex < perThemeTokens.length;
            themeIndex++
          ) {
            const tokens = perThemeTokens[themeIndex]!
            const tokenPointer = perThemePointers[themeIndex]!
            const token =
              tokenPointer < tokens.length ? tokens[tokenPointer]! : undefined

            if (
              token &&
              token.start < nextBoundary &&
              token.end > currentPosition
            ) {
              const baseColor = baseColors[themeIndex]!
              const tokenBits = token.bits
              const colorBits =
                (tokenBits & 0b00000000111111111000000000000000) >>> 15
              const colorMap = themeColorMaps[themeIndex]!
              const color = colorMap[colorBits] || ''
              const fontFlags = (tokenBits >>> 11) & 0b1111
              const fontStyle = fontFlags & 1 ? 'italic' : ''
              const fontWeight = fontFlags & 2 ? 'bold' : ''
              let textDecoration = ''

              if (fontFlags & 4) textDecoration += 'underline'
              if (fontFlags & 8)
                textDecoration += (textDecoration ? ' ' : '') + 'line-through'

              if (baseColor.toLowerCase() !== color.toLowerCase()) {
                isBaseColor = false
              }
              if (fontFlags !== 0) {
                hasTextStyles = true
              }

              if (useCssVariables) {
                const themeKey = `--${themeIndex}`
                if (color && !isBaseColor)
                  (style || (style = {}))[`${themeKey}fg`] = color
                if (fontStyle)
                  (style || (style = {}))[`${themeKey}fs`] = fontStyle
                if (fontWeight)
                  (style || (style = {}))[`${themeKey}fw`] = fontWeight
                if (textDecoration)
                  (style || (style = {}))[`${themeKey}td`] = textDecoration
              } else {
                if (color && !isBaseColor) (style || (style = {})).color = color
                if (fontStyle) (style || (style = {})).fontStyle = fontStyle
                if (fontWeight) (style || (style = {})).fontWeight = fontWeight
                if (textDecoration)
                  (style || (style = {})).textDecoration = textDecoration
              }
            }
          }
        }

        mergedLineTokens.push({
          value,
          start: currentPosition,
          end: nextBoundary,
          style: (style || {}) as TextMateTokenStyle,
          hasTextStyles,
          isBaseColor,
          isWhiteSpace,
        })

        currentPosition = nextBoundary
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
