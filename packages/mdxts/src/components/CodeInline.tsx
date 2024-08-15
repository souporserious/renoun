import React, { Fragment, Suspense } from 'react'
import { css, type CSSProp } from 'restyle'
import 'server-only'

import { analyzeSourceText } from '../project'
import { getThemeColors } from '../utils/get-theme-colors'
import type { Languages, Token } from '../utils/get-tokens'
import { CopyButton } from './CodeBlock/CopyButton'

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

  /** CSS styles to apply to the wrapping element. */
  css?: CSSProp

  /** Class name to apply to the wrapping element. */
  className?: string

  /** Style to apply to the wrapping element. */
  style?: React.CSSProperties

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string
}

function Token({ token }: { token: Token }) {
  if (token.isBaseColor || token.isWhitespace) {
    return token.value
  }

  const [classNames, styles] = css({
    fontStyle: token.fontStyle,
    fontWeight: token.fontWeight,
    textDecoration: token.textDecoration,
    color: token.color,
  })

  return (
    <span className={classNames}>
      {token.value}
      {styles}
    </span>
  )
}

async function CodeInlineAsync({
  value,
  language,
  allowCopy,
  paddingX,
  paddingY,
  css: cssProp,
  className,
  style,
  allowErrors,
}: CodeInlineProps) {
  const { tokens } = await analyzeSourceText({
    isInline: true,
    value,
    language,
    allowErrors,
  })
  const theme = await getThemeColors()
  const [classNames, styles] = css({
    padding: `${paddingY} ${paddingX} 0`,
    paddingRight: allowCopy ? `calc(1ch + 1lh + ${paddingX})` : undefined,
    gap: '1ch',
    color: theme.editor.foreground,
    backgroundColor: theme.editor.background,
    boxShadow: `0 0 0 1px ${theme.panel.border}`,
    borderRadius: 5,
    whiteSpace: 'nowrap',
    overflowX: 'scroll',
    position: 'relative',
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
    ...cssProp,
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
            {line.map((token, tokenIndex) => (
              <Token key={tokenIndex} token={token} />
            ))}
            {lineIndex === tokens.length - 1 ? null : '\n'}
          </Fragment>
        ))}
        {allowCopy ? (
          <CopyButton
            value={value}
            style={{
              right: paddingX,
              position: 'absolute',
              color: theme.activityBar.foreground,
            }}
          />
        ) : null}
      </code>
    </>
  )
}

/** Renders an inline `code` element with optional syntax highlighting and copy button. */
export async function CodeInline({
  paddingX = '0.25em',
  paddingY = '0.1em',
  ...props
}: CodeInlineProps) {
  return (
    <Suspense
      fallback={
        'value' in props && props.value ? (
          <code
            style={{
              padding: `${paddingY} ${paddingX} 0`,
            }}
          >
            {props.value}
          </code>
        ) : null
      }
    >
      <CodeInlineAsync paddingX={paddingX} paddingY={paddingY} {...props} />
    </Suspense>
  )
}
