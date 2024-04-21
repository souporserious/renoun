import React, { Fragment } from 'react'
import { type TokenProps } from './types'

export type RenderedTokensProps = {
  tokens: TokenProps[][]
  renderToken?: (token: TokenProps) => React.ReactNode
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
      const defaultTokenElement = (
        <span
          key={token.startIndex}
          style={{
            fontWeight: token.fontWeight,
            fontStyle: token.fontStyle,
            textDecoration: token.textDecoration,
            color: token.color,
          }}
        >
          {token.value}
        </span>
      )

      return renderToken ? renderToken(token) : defaultTokenElement
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
