import React, { Fragment, Suspense } from 'react'
import { css, styled, type CSSObject } from 'restyle'

import type { MDXComponents } from '../mdx/index.js'
import { analyzeSourceText } from '../project/client.js'
import type { Languages } from '../utils/get-language.js'
import { getThemeColors, getThemeTokenVariables } from '../utils/get-theme.js'
import type { Token } from '../utils/get-tokens.js'
import { CopyButton } from './CodeBlock/CopyButton.js'
import { getScrollContainerStyles } from './CodeBlock/utils.js'

export type CodeInlineProps = {
  /** Code snippet to be highlighted. */
  value: string

  /** Language of the code snippet. */
  language?: Languages

  /** Show or hide a persistent button that copies the `value` to the clipboard. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Horizontal padding to apply to the wrapping element. */
  paddingX?: string

  /** Vertical padding to apply to the wrapping element. */
  paddingY?: string

  /** CSS styles to apply to the wrapping element. */
  css?: CSSObject

  /** Class name to apply to the wrapping element. */
  className?: string

  /** Style to apply to the wrapping element. */
  style?: React.CSSProperties
}

function Token({ token }: { token: Token }) {
  if (token.isBaseColor || token.isWhitespace) {
    return token.value
  }

  const [classNames, Styles] = css(token.style)

  return (
    <span className={classNames}>
      {token.value}
      <Styles />
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
    shouldFormat: false,
    value,
    language,
    allowErrors,
  })
  const theme = await getThemeColors()
  const [classNames, Styles] = css({
    display: allowCopy ? 'inline-grid' : 'inline-block',
    alignItems: allowCopy ? 'center' : undefined,
    verticalAlign: 'text-bottom',
    padding: `${paddingY} ${paddingX} 0`,
    gap: allowCopy ? '1ch' : undefined,
    color: theme.editor.foreground,
    backgroundColor: theme.editor.background,
    boxShadow: `0 0 0 1px ${theme.panel.border}`,
    borderRadius: 5,
    whiteSpace: 'nowrap',
    position: 'relative',
    ...getScrollContainerStyles({
      paddingBottom: paddingY,
      color: theme.scrollbarSlider.hoverBackground,
    }),
    ...cssProp,
    ...getThemeTokenVariables(),
  })
  const children = tokens.map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {line.map((token, tokenIndex) => (
        <Token key={tokenIndex} token={token} />
      ))}
      {lineIndex === tokens.length - 1 ? null : '\n'}
    </Fragment>
  ))

  return (
    <>
      <code
        className={className ? `${classNames} ${className}` : classNames}
        style={style}
      >
        {allowCopy ? <Container>{children}</Container> : children}
        {allowCopy ? (
          <CopyButton
            value={value}
            css={{
              position: 'sticky',
              right: 0,
              gridArea: '1 / 2',
              marginLeft: 'auto',
              color: theme.activityBar.foreground,
            }}
          />
        ) : null}
      </code>
      <Styles />
    </>
  )
}

const Container = styled('span', {
  gridArea: '1 / 1',
  width: 'max-content',
})

const CodeFallback = styled('code', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1ch',
  whiteSpace: 'nowrap',
  overflowX: 'scroll',
})

/** Renders an inline `code` element with optional syntax highlighting and copy button. */
export function CodeInline({
  paddingX = '0.25em',
  paddingY = '0.1em',
  ...props
}: CodeInlineProps) {
  return (
    <Suspense
      fallback={
        'value' in props && props.value ? (
          <CodeFallback
            css={{
              display: props.allowCopy ? 'inline-flex' : 'inline-block',
              alignItems: props.allowCopy ? 'center' : undefined,
              verticalAlign: 'text-bottom',
              padding: `${paddingY} ${paddingX} 0`,
              paddingRight: props.allowCopy
                ? `calc(1ch + 1lh + ${paddingX})`
                : undefined,
              gap: props.allowCopy ? '1ch' : undefined,
              borderRadius: 5,
              whiteSpace: 'nowrap',
              position: 'relative',
              ...getScrollContainerStyles({ paddingBottom: paddingY }),
              ...props.css,
            }}
            className={props.className}
            style={props.style}
          >
            {props.value}
          </CodeFallback>
        ) : null
      }
    >
      <CodeInlineAsync paddingX={paddingX} paddingY={paddingY} {...props} />
    </Suspense>
  )
}

/** Parses the props of an MDX `code` element for passing to `CodeInline`. */
export function parseCodeProps({
  children,
  ...props
}: React.ComponentProps<NonNullable<MDXComponents['code']>>) {
  return {
    value: (children as string).trim(),
    ...props,
  } as {
    value: string
    language?: Languages
  } & Omit<React.ComponentProps<NonNullable<MDXComponents['code']>>, 'children'>
}
