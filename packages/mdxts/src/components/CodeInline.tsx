import React, { Fragment } from 'react'
import 'server-only'

import { getTheme } from '../index'
import type { Languages } from './CodeBlock/get-tokens'
import { getTokens } from './CodeBlock/get-tokens'

export type CodeInlineProps = {
  /** Code snippet to be highlighted. */
  value: string

  /** Language of the code snippet. */
  language?: Languages

  /** Class name to apply to the wrapping element. */
  className?: string

  /** Style to apply to the wrapping element. */
  style?: React.CSSProperties
}

/** Renders a `code` element with syntax highlighting. */
export async function CodeInline({
  language,
  className,
  style,
  ...props
}: CodeInlineProps) {
  const tokens = await getTokens(
    props.value
      // Trim extra whitespace from inline code blocks since it's difficult to read.
      .replace(/\s+/g, ' '),
    language
  )
  const theme = getTheme()

  return (
    <code
      className={className}
      style={{
        padding: '0.1em 0.25em',
        borderRadius: 5,
        boxShadow: `0 0 0 1px ${theme.panel.border}70`,
        backgroundColor: theme.editor.background,
        color: theme.editor.foreground,
        ...style,
      }}
    >
      {tokens.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {line.map((token, tokenIndex) => {
            if (token.isBaseColor || token.isWhitespace) {
              return token.value
            }
            return (
              <span
                key={tokenIndex}
                style={{
                  fontStyle: token.fontStyle,
                  fontWeight: token.fontWeight,
                  textDecoration: token.textDecoration,
                  color: token.color,
                }}
              >
                {token.value}
              </span>
            )
          })}
          {lineIndex === tokens.length - 1 ? null : '\n'}
        </Fragment>
      ))}
    </code>
  )
}
