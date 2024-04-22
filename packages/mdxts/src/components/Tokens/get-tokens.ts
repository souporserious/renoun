import { cache } from 'react'
import TextmateHighlighter from 'textmate-highlighter'
import { Node, SyntaxKind } from 'ts-morph'

import { isJsxOnly } from '../../utils/is-jsx-only'
import { project } from '../project'
import type { TokenProps } from './types'

const grammarMap = {
  mjs: 'javascript',
  js: 'javascript',
  ts: 'typescript',
}

type GrammarMapKey = keyof typeof grammarMap

type Color = string

type ThemeTokenColor = {
  name?: string
  scope: string | string[]
  settings: {
    background?: Color
    foreground?: Color
    fontStyle?: 'italic' | 'bold' | 'underline'
  }
}

export type Theme = {
  name: string
  type: 'light' | 'dark' | 'hc'
  colors: {
    [element: string]: Color
  }
  tokenColors: ThemeTokenColor[]
}

export type Token = {
  value: string
  start: number
  end: number
  color?: string
  fontStyle?: string
  fontWeight?: string
  textDecoration?: string
}

export type Tokens = Token[]

export type GetTokens = (
  filename: string,
  value: string,
  language: string
) => Promise<Tokens[]>

let highlighter: TextmateHighlighter | null = null

/** Converts a string of code to an array of highlighted tokens. */
export const getTokens: GetTokens = cache(async function getTokens(
  filename: string,
  value: string,
  language: string
) {
  if (highlighter === null) {
    highlighter = new TextmateHighlighter({
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
  }

  if (language === 'plaintext') {
    return [
      [
        {
          value,
          start: 0,
          end: value.length,
        },
      ],
    ]
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(language)
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
  const sourceFile = project.getSourceFile(filename)
  const tokens = (await new Promise(async (resolve) => {
    await highlighter!.highlightToAbstract(
      {
        code: sourceFile ? sourceFile.getFullText() : value,
        grammar: `source.${language}`,
        theme: 'night-owl',
      },
      resolve
    )
  })) as TokenProps[][]
  const importSpecifiers =
    sourceFile && !jsxOnly
      ? sourceFile
          .getImportDeclarations()
          .map((importDeclaration) => importDeclaration.getModuleSpecifier())
      : []
  const identifiers = sourceFile
    ? sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
    : []
  const symbolRanges = [...importSpecifiers, ...identifiers]
    .filter((node) => {
      const parent = node.getParent()
      const isJsxOnlyImport = jsxOnly
        ? parent?.getKind() === SyntaxKind.ImportSpecifier ||
          parent?.getKind() === SyntaxKind.ImportClause
        : false
      return (
        !isJsxOnlyImport && !Node.isJSDocTag(parent) && !Node.isJSDoc(parent)
      )
    })
    .map((node) => ({
      start: node.getStart(),
      end: node.getEnd(),
    }))
  let previousTokenStart = 0
  let parsedTokens = tokens.map((line) => {
    // increment position for line breaks
    if (line.length === 0) {
      previousTokenStart += 1
    }
    return line.flatMap((token, tokenIndex) => {
      const tokenStart = previousTokenStart
      const tokenEnd = tokenStart + token.value.length
      const lastToken = tokenIndex === line.length - 1

      // account for newlines
      previousTokenStart = lastToken ? tokenEnd + 1 : tokenEnd

      const initialToken = {
        value: token.value,
        start: tokenStart,
        end: tokenEnd,
        color: token.color,
        fontStyle: token.fontStyle,
        fontWeight: token.fontWeight,
        textDecoration: token.textDecoration,
      }
      let processedTokens: Tokens = []

      // split tokens by symbol ranges
      if (symbolRanges) {
        const tokenRange = symbolRanges.find((range) => {
          return range.start >= tokenStart && range.end <= tokenEnd
        })
        const inFullRange = tokenRange
          ? tokenRange.start === tokenStart && tokenRange.end === tokenEnd
          : false

        // split the token to isolate the symbol
        if (tokenRange && !inFullRange) {
          const symbolStart = tokenRange.start - tokenStart
          const symbolEnd = tokenRange.end - tokenStart
          const symbolToken = {
            ...initialToken,
            value: token.value.slice(symbolStart, symbolEnd),
            start: tokenStart + symbolStart,
            end: tokenStart + symbolEnd,
          } satisfies Token
          const beforeSymbolToken = {
            ...initialToken,
            value: token.value.slice(0, symbolStart),
            start: tokenStart,
            end: tokenStart + symbolStart,
          } satisfies Token
          const afterSymbolToken = {
            ...initialToken,
            value: token.value.slice(symbolEnd),
            start: tokenStart + symbolEnd,
            end: tokenEnd,
          } satisfies Token

          processedTokens = [beforeSymbolToken, symbolToken, afterSymbolToken]
        } else {
          processedTokens.push(initialToken)
        }
      } else {
        processedTokens.push(initialToken)
      }

      return processedTokens
    })
  })

  // Remove leading imports and whitespace for jsx only code blocks
  if (jsxOnly) {
    const firstJsxLineIndex = parsedTokens.findIndex((line) =>
      line.find((token) => token.value === '<')
    )
    parsedTokens = parsedTokens.slice(firstJsxLineIndex)
  }

  return parsedTokens
})
