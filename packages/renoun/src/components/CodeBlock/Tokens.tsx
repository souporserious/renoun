import React, { Fragment } from 'react'
import type { CSSObject } from 'restyle'
import { css } from 'restyle/css'

import { getTokens } from '../../project/client.js'
import type { Languages } from '../../textmate/index.js'
import { getContext } from '../../utils/context.js'
import { getThemeColors } from '../../utils/get-theme.js'
import { QuickInfo } from './QuickInfo.js'
import { QuickInfoProvider } from './QuickInfoProvider.js'
import { Context } from './Context.js'
import { Symbol } from './Symbol.js'

export interface TokensProps {
  /** Code string to highlight and render as tokens. */
  children?: string | Promise<string>

  /** Whether to allow errors to be displayed. */
  allowErrors?: boolean | string

  /** Whether to show errors. */
  showErrors?: boolean

  /** Language to use for syntax highlighting. */
  language?: Languages

  /** CSS style object to apply to the tokens and popover elements. */
  css?: {
    token?: CSSObject
    popover?: CSSObject
  }

  /** Class names to apply to the tokens and popover elements. */
  className?: {
    token?: string
    popover?: string
  }

  /** Styles to apply to the tokens and popover elements. */
  style?: {
    token?: React.CSSProperties
    popover?: React.CSSProperties
  }

  /** Custom render function for each line of tokens. */
  renderLine?: (line: {
    children: React.ReactNode
    index: number
    isLast: boolean
  }) => React.ReactNode
}

async function TokensAsync({
  children,
  language,
  allowErrors,
  showErrors,
  renderLine,
  css: cssProp = {},
  className = {},
  style = {},
}: TokensProps) {
  const context = getContext(Context)
  const theme = await getThemeColors()
  let value

  if (children) {
    if (typeof children === 'string') {
      value = children
    } else {
      value = await children
    }

    if (context) {
      context.value = value
    }
  } else {
    value = context?.value
  }

  context?.resolvers.resolve()

  if (value === undefined) {
    throw new Error(
      '[renoun] No code value provided to Tokens component. Pass a string, a promise that resolves to a string, or wrap within a `CodeBlock` that defines a `source` prop.'
    )
  }

  const tokens = await getTokens({
    filePath: context?.filePath,
    language: language || context?.language,
    allowErrors: allowErrors || context?.allowErrors,
    showErrors: showErrors || context?.showErrors,
    value,
  })
  const lastLineIndex = tokens.length - 1

  return (
    <QuickInfoProvider>
      {tokens.map((line, lineIndex) => {
        const lineChildren = line.map((token, tokenIndex) => {
          const hasSymbolMeta = token.diagnostics || token.quickInfo

          if (
            token.isWhiteSpace ||
            (!hasSymbolMeta && !token.hasTextStyles && token.isBaseColor)
          ) {
            return token.value
          }

          if (hasSymbolMeta) {
            const diagnosticStyles = {
              backgroundImage: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'bottom left',
            }
            const [symbolClassName, Styles] = css({
              ...token.style,
              ...(token.diagnostics && diagnosticStyles),
              ...cssProp.token,
            })

            return (
              <Symbol
                key={tokenIndex}
                highlightColor={theme.editor.hoverHighlightBackground}
                popover={
                  <QuickInfo
                    diagnostics={token.diagnostics}
                    quickInfo={token.quickInfo}
                    css={cssProp.popover}
                    className={className.token}
                    style={style.popover}
                  />
                }
                className={
                  className.token
                    ? `${symbolClassName} ${className.token}`
                    : symbolClassName
                }
                style={style.token}
              >
                {token.value}
                <Styles />
              </Symbol>
            )
          }

          const [classNames, Styles] = css(token.style)

          return (
            <span
              key={tokenIndex}
              className={
                className.token
                  ? `${classNames} ${className.token}`
                  : classNames
              }
              style={style.token}
            >
              {token.value}
              <Styles />
            </span>
          )
        })
        const isLastLine = lineIndex === lastLineIndex
        let lineToRender = renderLine
          ? renderLine({
              children: lineChildren,
              index: lineIndex,
              isLast: isLastLine,
            })
          : lineChildren

        if (renderLine && lineToRender) {
          return lineToRender
        }

        return (
          <Fragment key={lineIndex}>
            {lineChildren}
            {isLastLine ? null : '\n'}
          </Fragment>
        )
      })}
    </QuickInfoProvider>
  )
}

/** Renders syntax highlighted tokens for the `CodeBlock` component. */
export function Tokens(props: TokensProps) {
  return <TokensAsync {...props} />
}
