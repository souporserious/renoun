import type { bundledLanguages, bundledThemes } from 'shiki'
import { codeToTokens } from 'shiki'
import type { SourceFile, Diagnostic, ts } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'
import { findRoot } from '@manypkg/find-root'

import { isJsxOnly } from '../../utils/is-jsx-only'
import { project } from '../project'
import { getTheme } from './get-theme'
import { memoize } from './utils'

export const languageMap = {
  mjs: 'js',
  javascript: 'js',
  typescript: 'ts',
  shellscript: 'sh',
  yml: 'yaml',
} as const

export type Languages = keyof typeof bundledLanguages | keyof typeof languageMap

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
  quickInfo?: { displayText: string; documentationText: string }
  diagnostics?: Diagnostic[]
}

export type Tokens = Token[]

export type GetTokens = (
  value: string,
  language?: string,
  filename?: string,
  allowErrors?: string | boolean
) => Promise<Tokens[]>

/** Converts a string of code to an array of highlighted tokens. */
export const getTokens: GetTokens = memoize(async function getTokens(
  value: string,
  language: string = 'plaintext',
  filename?: string,
  allowErrors?: string | boolean
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
        } satisfies Token,
      ],
    ]
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(language)
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
  const sourceFile = filename ? project.getSourceFile(filename) : undefined
  const allowedErrorCodes =
    typeof allowErrors === 'string'
      ? allowErrors.split(',').map((code) => parseInt(code))
      : []
  const sourceFileDiagnostics =
    allowedErrorCodes.length === 0 && allowErrors
      ? []
      : sourceFile
        ? getDiagnostics(sourceFile).filter(
            (diagnostic) => !allowedErrorCodes.includes(diagnostic.getCode())
          )
        : []
  const theme = getTheme()
  const finalLanguage =
    languageMap[language as keyof typeof languageMap] || language
  const { tokens } = await codeToTokens(
    sourceFile ? sourceFile.getFullText() : value,
    {
      theme: 'night-owl',
      lang: finalLanguage as any,
    }
  )
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

      const tokenDiagnostics = sourceFileDiagnostics.filter((diagnostic) => {
        const start = diagnostic.getStart()
        const length = diagnostic.getLength()
        if (!start || !length) {
          return false
        }
        const end = start + length
        return start <= tokenStart && tokenEnd <= end
      })

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
        diagnostics: tokenDiagnostics.length ? tokenDiagnostics : undefined,
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

        // split the token to isolate the symbol
        if (symbolRange && !inFullRange) {
          const symbolToken: Token = {
            ...initialToken,
            value: token.content.slice(
              symbolRange.start - tokenStart,
              symbolRange.end - tokenStart
            ),
            start: symbolRange.start,
            end: symbolRange.end,
          }

          if (sourceFile && filename) {
            const quickInfo = getQuickInfo(
              sourceFile,
              filename,
              symbolRange.start,
              rootDirectory,
              baseDirectory
            )
            symbolToken.quickInfo = quickInfo
          }

          const beforeSymbolToken: Token = {
            ...initialToken,
            value: token.content.slice(0, symbolRange.start - tokenStart),
            start: tokenStart,
            end: symbolRange.start,
          }
          const tokenValueEnd = tokenStart + token.content.length

          if (tokenValueEnd > symbolRange.end) {
            const afterSymbolToken: Token = {
              ...initialToken,
              value: token.content.slice(symbolRange.end - tokenStart),
              start: symbolRange.end,
              end: tokenEnd,
            }
            processedTokens = [beforeSymbolToken, symbolToken, afterSymbolToken]
          } else {
            processedTokens = [beforeSymbolToken, symbolToken]
          }
        } else {
          if (symbolRange && sourceFile && filename) {
            initialToken.quickInfo = getQuickInfo(
              sourceFile,
              filename,
              symbolRange.start,
              rootDirectory,
              baseDirectory
            )
          }

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

/** Get the diagnostics for a source file, coerced into a module if necessary. */
function getDiagnostics(sourceFile: SourceFile) {
  // if no imports/exports are found, add an empty export to ensure the file is a module
  const hasImports = sourceFile.getImportDeclarations().length > 0
  const hasExports = sourceFile.getExportDeclarations().length > 0

  if (!hasImports && !hasExports) {
    sourceFile.addExportDeclaration({})
  }

  const diagnostics = sourceFile.getPreEmitDiagnostics()

  // remove the empty export
  if (!hasImports && !hasExports) {
    sourceFile.getExportDeclarations().at(0)!.remove()
  }

  return diagnostics
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
