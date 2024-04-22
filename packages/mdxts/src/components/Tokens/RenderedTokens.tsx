import React, { Fragment } from 'react'

import type { GetTokens, Token } from './get-tokens'

export type RenderedTokensProps = {
  tokens: Awaited<ReturnType<GetTokens>>
  renderToken?: (token: Token) => React.ReactNode
  renderLine?: (
    line: React.ReactNode,
    lineIndex: number,
    isLastLine: boolean
  ) => React.ReactNode
}

export async function RenderedTokens({
  tokens,
  renderLine,
  renderToken,
}: RenderedTokensProps) {
  const lastLineIndex = tokens.length - 1

  return tokens.map((line, lineIndex) => {
    const lineContent = line.map((token) => {
      if (renderToken) {
        return renderToken(token)
      }

      const hasTextStyles = Boolean(
        token.fontStyle || token.fontWeight || token.textDecoration
      )

      if ((!hasTextStyles && token.isBaseColor) || token.isWhitespace) {
        return token.value
      }

      return (
        <span
          key={token.start}
          style={{
            fontStyle: token.fontStyle,
            fontWeight: token.fontWeight,
            textDecoration: token.textDecoration,
            color: token.isBaseColor ? undefined : token.color,
          }}
        >
          {token.value}
        </span>
      )
    })
    const isLastLine = lineIndex === lastLineIndex
    let lineToRender = renderLine
      ? renderLine(lineContent, lineIndex, isLastLine)
      : lineContent

    if (renderLine && lineToRender) {
      return lineToRender
    }

    return (
      <Fragment key={lineIndex}>
        {lineContent}
        {isLastLine ? null : '\n'}
      </Fragment>
    )
  })
}
