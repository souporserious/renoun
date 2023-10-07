import { getHighlighter as shikiGetHighlighter } from 'shiki'
import type { Diagnostic } from 'ts-morph'

export type Theme = Parameters<typeof shikiGetHighlighter>[0]['theme']

export type Highlighter = (code: string, language: any) => Token[][]

export type Tokens = Token[][]

export type Token = {
  content: string
  color?: string
  explanation?: any
  fontStyle: Record<string, string | number>
  start: number
  end: number
}

export type ProcessedToken = Token & {
  hasError: boolean
}

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
export function processToken(
  token: Token,
  diagnostic?: Diagnostic
): ProcessedToken[] {
  const diagnosticStart = diagnostic?.getStart()
  const diagnosticEnd = diagnosticStart + diagnostic?.getLength()

  console.log({ diagnosticStart, diagnosticEnd, token })

  if (token.start >= diagnosticStart && token.end <= diagnosticEnd) {
    // If the whole token is an error
    return [
      {
        ...token,
        hasError: true,
      },
    ]
  } else if (diagnosticStart > token.start && diagnosticEnd < token.end) {
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

/** Returns a function that converts code to an array of highlighted tokens */
export async function getHighlighter(options: any): Promise<Highlighter> {
  const highlighter = await shikiGetHighlighter(options)

  return function (code: string, language: any) {
    const tokens = highlighter.codeToThemedTokens(code, language)
    let position = 0

    return tokens.map((line) => {
      return line.map((token, tokenIndex) => {
        const isLastToken = tokenIndex === line.length - 1
        const start = position
        position += token.content.length
        const end = position
        const fontStyle = getFontStyle(token.fontStyle)

        // Offset the position by 1 to account for new lines
        if (isLastToken) {
          position += 1
        }

        return { ...token, fontStyle, start, end }
      })
    })
  }
}
