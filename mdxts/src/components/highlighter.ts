import { getHighlighter as shikiGetHighlighter } from 'shiki'
import type { Diagnostic, SourceFile } from 'ts-morph'
import { SyntaxKind } from 'ts-morph'
import { getDiagnosticForToken } from './diagnostics'

type Color = string

type TokenColor = {
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
  tokenColors: TokenColor[]
}

export type Token = {
  content: string
  color?: string
  explanation?: any
  fontStyle: Record<string, string | number>
  start: number
  end: number
  hasError: boolean
  isSymbol: boolean
}

export type Tokens = Token[]

export type Highlighter = (
  code: string,
  language: any,
  sourceFile?: SourceFile,
  isJsxOnly?: boolean
) => Tokens[]

const FontStyle = {
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
}

function getFontStyle(fontStyle: number): any {
  const style = {}
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

/** Returns a function that converts code to an array of highlighted tokens */
export async function getHighlighter(options: any): Promise<Highlighter> {
  const highlighter = await shikiGetHighlighter(options)

  return function (
    value: string,
    language: any,
    sourceFile?: SourceFile,
    isJsxOnly: boolean = false
  ) {
    const code = sourceFile ? sourceFile.getFullText() : value
    const diagnostics = getSourceFileDiagnostics(sourceFile)
    const tokens = highlighter
      .codeToThemedTokens(code, language, null, {
        includeExplanation: false,
      })
      .filter((line) => {
        // filter out imports when jsx only source file
        if (isJsxOnly) {
          return !line.some((token) => token.content === 'import')
        }

        return true
      })
    const identifierRanges: Array<{ start: number; end: number }> = sourceFile
      ? sourceFile
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .filter((node) => {
            // filter out imports when jsx only source file
            if (isJsxOnly) {
              const parent = node.getParent()
              return (
                parent?.getKind() !== SyntaxKind.ImportSpecifier &&
                parent?.getKind() === SyntaxKind.ImportClause
              )
            }

            return true
          })
          .map((node) => {
            const start = node.getStart()
            const end = start + node.getWidth()
            return { start, end }
          })
      : null
    let position = 0
    if (identifierRanges) {
      console.log('identifierRanges', identifierRanges)
    }
    const parsedTokens = tokens.map((line) => {
      if (line.length === 0) {
        position += 1
      }
      return line.flatMap((token, tokenIndex) => {
        const tokenStart = position
        const tokenEnd = tokenStart + token.content.length
        const lastToken = tokenIndex === line.length - 1

        position = lastToken ? tokenEnd + 1 : tokenEnd

        const initialToken = {
          color: token.color,
          content: token.content,
          fontStyle: getFontStyle(token.fontStyle),
          start: tokenStart,
          end: tokenEnd,
          hasError: false,
          isSymbol: false,
        }
        let processedTokens: Tokens = [,]

        // split tokens by identifier ranges
        if (identifierRanges) {
          const tokenRange = identifierRanges.find((range) => {
            return range.start >= tokenStart && range.end <= tokenEnd
          })
          const inFullRange = tokenRange
            ? tokenRange.start === tokenStart && tokenRange.end === tokenEnd
            : false

          // If not the full token range, split the token to isolate the identifier
          if (tokenRange && !inFullRange) {
            const identifierStart = tokenRange.start - tokenStart
            const identifierEnd = tokenRange.end - tokenStart
            const identifier = token.content.slice(
              identifierStart,
              identifierEnd
            )
            const identifierToken = {
              ...initialToken,
              content: identifier,
              start: tokenStart + identifierStart,
              end: tokenStart + identifierEnd,
            }
            const beforeIdentifierToken = {
              ...initialToken,
              content: token.content.slice(0, identifierStart),
              start: tokenStart,
              end: tokenStart + identifierStart,
            }
            const afterIdentifierToken = {
              ...initialToken,
              content: token.content.slice(identifierEnd),
              start: tokenStart + identifierEnd,
              end: tokenEnd,
            }

            processedTokens = [
              beforeIdentifierToken,
              identifierToken,
              afterIdentifierToken,
            ]
          } else {
            processedTokens.push(initialToken)
          }
        } else {
          processedTokens.push(initialToken)
        }

        return processedTokens
      })
    })

    // remove first line if it's jsx only since it's leftover whitespace from import statements
    if (isJsxOnly) {
      parsedTokens.shift()
    }

    return parsedTokens
  }
}

function getSourceFileDiagnostics(sourceFile?: SourceFile) {
  if (!sourceFile) {
    return
  }

  const diagnostics = sourceFile.getPreEmitDiagnostics()

  if (diagnostics.length === 0) {
    return
  }

  return diagnostics
}
