import type { bundledLanguages, bundledThemes } from 'shiki/bundle/web'
import { getHighlighter } from 'shiki/bundle/web'
import type { SourceFile, Diagnostic, ts } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'
import { findRoot } from '@manypkg/find-root'

import { getThemeColors } from '../../index'
import { isJsxOnly } from '../../utils/is-jsx-only'
import { getTheme } from '../../utils/get-theme'
import { project } from '../project'
import { getDiagnosticsOrThrow } from './get-diagnostics-or-throw'
import { splitTokenByRanges } from './split-tokens-by-ranges'

export const languageMap = {
  mjs: 'js',
} as const

export type Languages =
  | keyof typeof bundledLanguages
  | keyof typeof languageMap
  | 'plaintext'

/** Normalizes language to a specific grammar language key. */
export function getLanguage(
  language: Languages
): keyof typeof bundledLanguages {
  if (language in languageMap) {
    return languageMap[language as keyof typeof languageMap]
  }
  return language as keyof typeof bundledLanguages
}

export type Themes = keyof typeof bundledThemes

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
  isBaseColor: boolean
  isWhitespace: boolean
  isSymbol: boolean
  quickInfo?: { displayText: string; documentationText: string }
  diagnostics?: Diagnostic[]
}

export type Tokens = Token[]

export type GetTokens = (
  value: string,
  language?: Languages,
  filename?: string,
  allowErrors?: string | boolean
) => Promise<Tokens[]>

let highlighter: Awaited<ReturnType<typeof getHighlighter>> | null = null

/** Converts a string of code to an array of highlighted tokens. */
export async function getTokens(
  value: string,
  language: Languages = 'plaintext',
  filename?: string,
  allowErrors?: string | boolean,
  showErrors?: boolean
) {
  if (language === 'plaintext') {
    return [
      [
        {
          value,
          start: 0,
          end: value.length,
          isBaseColor: true,
          isWhitespace: false,
          isSymbol: false,
        } satisfies Token,
      ],
    ]
  }

  if (highlighter === null) {
    highlighter = await getHighlighter({
      langs: ['css', 'js', 'jsx', 'ts', 'tsx', 'mdx', 'sh'],
      themes: [getTheme()],
    })
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(language)
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
  const sourceFile = filename ? project.getSourceFile(filename) : undefined
  const sourceFileDiagnostics = getDiagnosticsOrThrow(
    sourceFile,
    allowErrors,
    showErrors
  )
  const theme = await getThemeColors()
  const finalLanguage = getLanguage(language)
  let { tokens } = highlighter.codeToTokens(
    sourceFile ? sourceFile.getFullText() : value,
    {
      theme: 'mdxts',
      lang: finalLanguage as any,
    }
  )
  // If tokens contain an "export { }" statement, remove it
  const exportStatementIndex = tokens.findIndex((line) =>
    line
      .map((token) => token.content)
      .join('')
      .includes('export { }')
  )
  if (exportStatementIndex > -1) {
    // trim the export statement and the following line break
    tokens = tokens.slice(0, exportStatementIndex - 1)
  }

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
        ? Node.isImportSpecifier(parent) || Node.isImportClause(parent)
        : false
      return (
        !isJsxOnlyImport && !Node.isJSDocTag(parent) && !Node.isJSDoc(parent)
      )
    })
    .map((node) => {
      // Offset module specifiers since they contain quotes which are tokenized separately
      // e.g. import React from 'react' -> ["'", "react", "'"]
      if (Node.isStringLiteral(node)) {
        return {
          start: node.getStart() + 1,
          end: node.getEnd() - 1,
        }
      }

      return {
        start: node.getStart(),
        end: node.getEnd(),
      }
    })
  const rootDirectory = (await findRoot(process.cwd())).rootDir
  const baseDirectory = process.cwd().replace(rootDirectory, '')
  let previousTokenStart = 0
  let parsedTokens = tokens.map((line) => {
    // increment position for line breaks
    if (line.length === 0) {
      previousTokenStart += 1
    }
    return line.flatMap((token, tokenIndex) => {
      const tokenStart = previousTokenStart
      const tokenEnd = tokenStart + token.content.length
      const lastToken = tokenIndex === line.length - 1

      // account for newlines
      previousTokenStart = lastToken ? tokenEnd + 1 : tokenEnd

      const fontStyle = token.fontStyle ? getFontStyle(token.fontStyle) : {}
      const initialToken: Token = {
        value: token.content,
        start: tokenStart,
        end: tokenEnd,
        color: token.color,
        isBaseColor: token.color
          ? token.color.toLowerCase() === theme.foreground.toLowerCase()
          : false,
        isWhitespace: token.content.trim() === '',
        isSymbol: false,
        ...fontStyle,
      }
      let processedTokens: Tokens = []

      // split tokens by symbol ranges
      if (symbolRanges.length) {
        const symbolRange = symbolRanges.find((range) => {
          return range.start >= tokenStart && range.end <= tokenEnd
        })
        const inFullRange = symbolRange
          ? symbolRange.start === tokenStart && symbolRange.end === tokenEnd
          : false

        if (symbolRange && !inFullRange) {
          processedTokens = splitTokenByRanges(initialToken, symbolRanges)
        } else {
          processedTokens.push({
            ...initialToken,
            isSymbol: inFullRange,
          })
        }
      } else {
        processedTokens.push(initialToken)
      }

      return processedTokens.map((token) => {
        if (!token.isSymbol) {
          return token
        }

        const diagnostics = sourceFileDiagnostics.filter((diagnostic) => {
          const start = diagnostic.getStart()
          const length = diagnostic.getLength()
          if (!start || !length) {
            return false
          }
          const end = start + length
          return token.start >= start && token.end <= end
        })
        const quickInfo =
          sourceFile && filename
            ? getQuickInfo(
                sourceFile,
                filename,
                token.start,
                rootDirectory,
                baseDirectory
              )
            : undefined

        return {
          ...token,
          quickInfo,
          diagnostics: diagnostics.length ? diagnostics : undefined,
        }
      })
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
}

/** Convert documentation entries to markdown-friendly links. */
function formatDocumentationText(documentation: ts.SymbolDisplayPart[]) {
  let markdownText = ''
  let currentLinkText = ''
  let currentLinkUrl = ''

  documentation.forEach((part) => {
    if (part.kind === 'text') {
      markdownText += part.text
    } else if (part.kind === 'linkText') {
      const [url, ...descriptionParts] = part.text.split(' ')
      currentLinkUrl = url
      currentLinkText = descriptionParts.join(' ') || url
    } else if (part.kind === 'link') {
      if (currentLinkUrl) {
        markdownText += `[${currentLinkText}](${currentLinkUrl})`
        currentLinkText = ''
        currentLinkUrl = ''
      }
    }
  })

  return markdownText
}

/** Get the quick info a token */
function getQuickInfo(
  sourceFile: SourceFile,
  filename: string,
  tokenStart: number,
  rootDirectory: string,
  baseDirectory: string
) {
  const quickInfo = sourceFile
    .getProject()
    .getLanguageService()
    .compilerObject.getQuickInfoAtPosition(filename, tokenStart)

  if (!quickInfo) {
    return
  }

  const displayParts = quickInfo.displayParts || []
  const displayText = displayParts
    .map((part) => part.text)
    .join('')
    // First, replace root directory to handle root node_modules
    .replaceAll(rootDirectory, '.')
    // Next, replace base directory for on disk paths
    .replaceAll(baseDirectory, '')
    // Finally, replace the in-memory mdxts directory
    .replaceAll('/mdxts', '')
  const documentation = quickInfo.documentation || []
  const documentationText = formatDocumentationText(documentation)

  return {
    displayText,
    documentationText,
  }
}

const FontStyle = {
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
}

function getFontStyle(fontStyle: number) {
  const style: {
    fontStyle?: 'italic'
    fontWeight?: 'bold'
    textDecoration?: 'underline' | 'line-through'
  } = {
    fontStyle: undefined,
    fontWeight: undefined,
    textDecoration: undefined,
  }
  if (fontStyle === FontStyle.Italic) {
    style['fontStyle'] = 'italic'
  }
  if (fontStyle === FontStyle.Bold) {
    style['fontWeight'] = 'bold'
  }
  if (fontStyle === FontStyle.Underline) {
    style['textDecoration'] = 'underline'
  }
  if (fontStyle === FontStyle.Strikethrough) {
    style['textDecoration'] = 'line-through'
  }
  return style
}
