import React, { Suspense } from 'react'
import { css, styled, type CSSObject } from 'restyle'

import type { Languages } from '../grammars/index.js'
import { grammars } from '../grammars/index.js'
import { getThemeColors } from '../utils/get-theme.js'
import { getConfig } from './Config/ServerConfigContext.js'
import { Tokens } from './CodeBlock/Tokens.js'
import { getScrollContainerStyles } from './CodeBlock/utils.js'
import { CopyButton } from './CopyButton/index.js'

export type CodeInlineProps = {
  /** Code snippet to be highlighted. */
  children: string

  /** Language of the code snippet. */
  language?: Languages

  /** Show or hide a persistent button that copies the `children` string or provided text to the clipboard. */
  allowCopy?: boolean | string

  /** Whether or not to allow errors when a `language` is specified. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide error diagnostics when a `language` is specified. */
  showErrors?: boolean

  /** Whether or not to analyze the source code for type errors and provide quick information on hover. */
  shouldAnalyze?: boolean

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

/** Renders an inline `code` element with optional syntax highlighting and copy button. */
export const CodeInline =
  process.env.NODE_ENV === 'development'
    ? CodeInlineWithFallback
    : CodeInlineAsync

function CodeInlineWithFallback({
  paddingX = '0.25em',
  paddingY = '0.1em',
  shouldAnalyze = false,
  ...props
}: CodeInlineProps) {
  return (
    <Suspense
      fallback={
        <CodeFallback
          css={{
            display: props.allowCopy ? 'inline-flex' : 'inline-block',
            alignItems: props.allowCopy ? 'center' : undefined,
            verticalAlign: 'text-bottom',
            padding: `${paddingY} ${paddingX}`,
            paddingRight: props.allowCopy
              ? `calc(1ch + 1lh + ${paddingX})`
              : undefined,
            gap: props.allowCopy ? '1ch' : undefined,
            borderRadius: 5,
            whiteSpace: 'nowrap',
            position: 'relative',
            ...props.css,
          }}
          className={props.className}
          style={props.style}
        >
          {props.children}
        </CodeFallback>
      }
    >
      <CodeInlineAsync
        paddingX={paddingX}
        paddingY={paddingY}
        shouldAnalyze={shouldAnalyze}
        {...props}
      />
    </Suspense>
  )
}

async function CodeInlineAsync({
  children,
  language,
  allowCopy,
  paddingX,
  paddingY,
  css: cssProp,
  className,
  style,
  allowErrors,
  showErrors,
  shouldAnalyze,
}: CodeInlineProps) {
  const config = await getConfig()
  const theme = await getThemeColors(config.theme)
  const [classNames, Styles] = css({
    display: allowCopy ? 'inline-grid' : 'inline',
    alignItems: allowCopy ? 'center' : undefined,
    verticalAlign: 'text-bottom',
    padding: `${paddingY} ${paddingX} 0`,
    gap: allowCopy ? '1ch' : undefined,
    color: theme.foreground,
    backgroundColor: theme.background,
    boxShadow: `0 0 0 1px ${theme.panel.border}`,
    borderRadius: 5,
    position: 'relative',
    overflowY: 'hidden',
    ...getScrollContainerStyles({
      color: theme.scrollbarSlider.hoverBackground,
    }),
    ...cssProp,
  })
  const childrenToRender = language ? (
    <Tokens
      language={language}
      allowErrors={allowErrors}
      showErrors={showErrors}
      shouldAnalyze={shouldAnalyze}
    >
      {children}
    </Tokens>
  ) : (
    children
  )

  return (
    <>
      <code
        className={className ? `${classNames} ${className}` : classNames}
        style={style}
      >
        {allowCopy ? (
          <Container>{childrenToRender}</Container>
        ) : (
          childrenToRender
        )}
        {allowCopy ? (
          <CopyButton
            value={typeof allowCopy === 'string' ? allowCopy : children}
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
  overflowY: 'hidden',
})

/** Parses the props of an MDX `code` element for passing to `CodeInline`. */
export function parseCodeProps(props: React.ComponentProps<'code'>): {
  /** The code fence content. */
  children: string

  /** The language of the code fence if defined e.g. `tsx`. */
  language?: Languages
} & Omit<React.ComponentProps<'code'>, 'children' | 'className' | 'style'> {
  let { children, className, style, ...restProps } = props

  if (typeof children !== 'string') {
    throw new Error(
      `[renoun] the CodeInline component only supports string children.`
    )
  }

  let childrenToRender: string = children
  let language: Languages | undefined
  const firstSpaceIndex = children.indexOf(' ')

  if (firstSpaceIndex > -1) {
    const possibleLanguage = children.substring(0, firstSpaceIndex) as Languages
    const isValidLanguage = Object.values(grammars).some((aliases) =>
      (aliases as readonly Languages[]).includes(possibleLanguage)
    )

    if (isValidLanguage) {
      language = possibleLanguage
      childrenToRender = children.slice(firstSpaceIndex + 1)
    }
  }

  return {
    children: childrenToRender,
    language,
    ...restProps,
  }
}
