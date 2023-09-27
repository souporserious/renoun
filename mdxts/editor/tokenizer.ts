// Copied from @code-hike/ligher: https://github.com/code-hike/lighter/blob/main/lib/src/tokenizer.ts
import type { IGrammar, StateStack } from 'vscode-textmate'

type Token = {
  content: string
  style: {
    color?: string
    fontStyle?: 'italic'
    fontWeight?: 'bold'
    textDecoration?: 'underline' | 'line-through'
  }
  startIndex?: number
  scopes?: string[]
}

const FONT_STYLE_MASK = 0b00000000000000000111100000000000
const FOREGROUND_MASK = 0b00000000111111111000000000000000
const BACKGROUND_MASK = 0b11111111000000000000000000000000
const STYLE_MASK = 0b00000000111111111111100000000000
const FONT_STYLE_OFFSET = 11
const FOREGROUND_OFFSET = 15
const BACKGROUND_OFFSET = 24

const FontStyle = {
  NotSet: -1,
  None: 0,
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
}

export function tokenize(code: string, grammar: IGrammar, colors: string[]) {
  let stack: StateStack | null = null
  const lines = code.split(/\r?\n|\r/g)
  return lines.map((line) => {
    const { rawTokens, nextStack } = tokenizeLine(grammar, stack, line)
    stack = nextStack
    return rawTokens.map(({ content, metadata }) => ({
      content,
      style: getStyle(metadata, colors),
    }))
  })
}

type RawToken = { content: string; metadata: number }

export function tokenizeLine(
  grammar: IGrammar,
  stack: StateStack,
  line: string,
  config?: { preserveWhitespace?: boolean }
) {
  const { tokens, ruleStack } = grammar.tokenizeLine2(line, stack)
  const newTokens: RawToken[] = []
  let tokenEnd = line.length
  for (let i = tokens.length - 2; i >= 0; i = i - 2) {
    const tokenStart = tokens[i]
    const metadata = tokens[i + 1]
    const content = line.slice(tokenStart, tokenEnd)
    newTokens.unshift({ content, metadata })
    tokenEnd = tokenStart
  }

  let rawTokens: RawToken[] = []

  if (config?.preserveWhitespace) {
    rawTokens = newTokens
  } else {
    // join empty space tokens with the previous token (or the next token if there's no previous token)
    for (let i = 0; i < newTokens.length; i++) {
      const token = newTokens[i]
      if (token.content.trim() !== '') {
        // if has same style as previous token, join with previous token
        const prev = rawTokens[rawTokens.length - 1]
        if (
          prev &&
          (prev.metadata & STYLE_MASK) === (token.metadata & STYLE_MASK)
        ) {
          prev.content += token.content
        } else {
          rawTokens.push(token)
        }
      } else if (rawTokens.length > 0) {
        rawTokens[rawTokens.length - 1].content += token.content
      } else if (i < newTokens.length - 1) {
        newTokens[i + 1].content = token.content + newTokens[i + 1].content
      } else {
        rawTokens.push(token)
      }
    }
  }

  return { rawTokens, nextStack: ruleStack }
}

export function tokenizeWithScopes(
  code: string,
  grammar: IGrammar,
  colors: string[]
) {
  let stack: StateStack | null = null
  const lines = code.split(/\r?\n|\r/g)

  return lines.map((line) => {
    const { rawTokens, nextStack } = tokenizeLine(grammar, stack, line, {
      preserveWhitespace: true,
    })
    const newTokens = rawTokens.map(({ content, metadata }) => ({
      content,
      style: getStyle(metadata, colors),
    }))
    const tokensWithScopes = addScopesToLine(line, stack, grammar, newTokens)

    stack = nextStack
    return tokensWithScopes
  })
}

export function addScopesToLine(
  line: string,
  stack: StateStack | null,
  grammar: IGrammar,
  styledTokens: Token[]
) {
  const { tokens } = grammar.tokenizeLine(line, stack)

  const newTokens: Token[] = []

  for (let index = 0; index < tokens.length; index++) {
    const { startIndex, endIndex, scopes } = tokens[index]

    let count = 0
    const styledToken = styledTokens.find((t) => {
      count += t.content.length

      if (startIndex < count) {
        return true
      }
    })

    newTokens.push({
      ...styledToken,
      startIndex,
      content: line.slice(startIndex, endIndex),
      scopes: scopes.reverse(),
    })
  }

  return newTokens
}

export function getStyle(metadata: number, colors: string[]): Token['style'] {
  const fg = (metadata & FOREGROUND_MASK) >>> FOREGROUND_OFFSET
  const bg = (metadata & BACKGROUND_MASK) >>> BACKGROUND_OFFSET
  const style = {
    color: colors[fg],
    backgroundColor: colors[bg],
  }
  const fs = (metadata & FONT_STYLE_MASK) >>> FONT_STYLE_OFFSET
  if (fs & FontStyle.Italic) {
    style['fontStyle'] = 'italic'
  }
  if (fs & FontStyle.Bold) {
    style['fontWeight'] = 'bold'
  }
  if (fs & FontStyle.Underline) {
    style['textDecoration'] = 'underline'
  }
  if (fs & FontStyle.Strikethrough) {
    style['textDecoration'] = 'line-through'
  }
  return style
}
