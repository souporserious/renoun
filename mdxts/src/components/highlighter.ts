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

/** Returns an array of tokens with error information. */
export function processToken(token: Token, diagnostic?: Diagnostic): Tokens {
  const diagnosticStart = diagnostic?.getStart()
  const diagnosticEnd = diagnosticStart + diagnostic?.getLength()

  if (diagnosticStart > token.start && diagnosticEnd < token.end) {
    // If only a part of the token is an error, split it
    return [
      {
        ...token,
        content: token.content.slice(0, diagnosticStart - token.start),
        hasError: false,
      },
      {
        ...token,
        content: token.content.slice(
          diagnosticStart - token.start,
          diagnosticEnd - token.start
        ),
        hasError: true,
      },
      {
        ...token,
        content: token.content.slice(diagnosticEnd - token.start),
        hasError: false,
      },
    ]
  } else if (token.start >= diagnosticStart && token.end <= diagnosticEnd) {
    // If the whole token is an error
    return [
      {
        ...token,
        hasError: true,
      },
    ]
  } else {
    // No error in this token
    return [
      {
        ...token,
        hasError: false,
      },
    ]
  }
}

/** Returns an array of tokens with symbol information. */
function processSymbol(
  token: Token,
  ranges: Array<{ start: number; end: number }>
): Tokens {
  // If no ranges, return token as-is
  if (!ranges || ranges.length === 0) {
    return [{ ...token, isSymbol: false }]
  }

  const intersectingRanges = ranges.filter(
    (range) => token.end > range.start && token.start < range.end
  )

  if (intersectingRanges.length === 0) {
    return [{ ...token, isSymbol: false }]
  }

  // Process the first intersecting range and split the token accordingly
  const firstRange = intersectingRanges[0]
  let tokensAfterProcessing: Tokens = []

  if (firstRange.start > token.start) {
    tokensAfterProcessing.push({
      ...token,
      content: token.content.slice(0, firstRange.start - token.start),
      isSymbol: false,
    })
  }

  if (token.start < firstRange.end && token.end > firstRange.start) {
    tokensAfterProcessing.push({
      ...token,
      content: token.content.slice(
        Math.max(token.start, firstRange.start) - token.start,
        Math.min(token.end, firstRange.end) - token.start
      ),
      isSymbol: true,
    })
  }

  if (firstRange.end < token.end) {
    tokensAfterProcessing.push({
      ...token,
      content: token.content.slice(firstRange.end - token.start),
      isSymbol: false,
    })
  }

  // Remove the processed range and recursively process the split tokens
  const remainingRanges = intersectingRanges.slice(1)
  return tokensAfterProcessing.flatMap((t) => processSymbol(t, remainingRanges))
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
    const ranges: Array<{ start: number; end: number }> = sourceFile
      ?.getDescendantsOfKind(SyntaxKind.Identifier)
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
        const end = node.getEnd()
        return { start, end }
      })
    let position = 0
    const parsedTokens = tokens.map((line, lineIndex) => {
      return line.flatMap((token, tokenIndex) => {
        const isLastToken = tokenIndex === line.length - 1
        const tokenStart = position
        position += token.content.length
        const tokenEnd = position

        // Offset the position by 1 to account for new lines
        if (isLastToken) {
          position += 1
        }

        let processedTokens: Tokens = [
          {
            color: token.color,
            content: token.content,
            fontStyle: getFontStyle(token.fontStyle),
            start: tokenStart,
            end: tokenEnd,
            hasError: false,
            isSymbol: false,
          },
        ]

        // Check for diagnostics
        if (diagnostics) {
          const diagnostic = getDiagnosticForToken(
            token,
            tokenIndex,
            lineIndex,
            tokens,
            diagnostics,
            code
          )

          if (diagnostic) {
            processedTokens = processToken(processedTokens[0], diagnostic)
          }
        }

        return processedTokens.flatMap((token) => processSymbol(token, ranges))
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
