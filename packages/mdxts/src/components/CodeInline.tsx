import React, { Fragment } from 'react'
import { css } from 'restyle'
import 'server-only'

import { getThemeColors } from '../index'
import { CopyButton } from './CodeBlock/CopyButton'
import type { Languages } from './CodeBlock/get-tokens'
import { getTokens } from './CodeBlock/get-tokens'

export type CodeInlineProps = {
  /** Code snippet to be highlighted. */
  value: string

  /** Language of the code snippet. */
  language?: Languages

  /** Show or hide a persistent button that copies the `value` to the clipboard. */
  allowCopy?: boolean

  /** Horizontal padding to apply to the wrapping element. */
  paddingX?: string

  /** Vertical padding to apply to the wrapping element. */
  paddingY?: string

  /** Class name to apply to the wrapping element. */
  className?: string

  /** Style to apply to the wrapping element. */
  style?: React.CSSProperties
}

/** Renders an inline `code` element with optional syntax highlighting and copy button. */
export async function CodeInline({
  value,
  language,
  allowCopy,
  paddingX = '0.25em',
  paddingY = '0.1em',
  className,
  style,
}: CodeInlineProps) {
  const tokens = await getTokens(
    value
      // Trim extra whitespace from inline code blocks since it's difficult to read.
      .replace(/\s+/g, ' '),
    language
  )
  const theme = await getThemeColors()
  const [classNames, styles] = css({
    display: 'inline-flex',
    padding: `${paddingY} ${paddingX} 0`,
    gap: '1ch',
    color: theme.editor.foreground,
    backgroundColor: theme.editor.background,
    boxShadow: `0 0 0 1px ${theme.panel.border}`,
    borderRadius: 5,
    whiteSpace: 'nowrap',
    overflowX: 'scroll',
    '::-webkit-scrollbar': {
      height: paddingY,
    },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: 'rgba(0, 0, 0, 0)',
    },
    ':hover::-webkit-scrollbar-thumb': {
      backgroundColor: theme.scrollbarSlider.hoverBackground,
    },
    '@-moz-document url-prefix()': {
      paddingBottom: paddingY,
    },
  })

  return (
    <>
      {styles}
      <code
        className={className ? `${classNames} ${className}` : classNames}
        style={style}
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
        {allowCopy ? <CopyButton value={value} /> : null}
      </code>
    </>
  )
}
