import React, { Fragment } from 'react'
import { css, type CSSObject } from 'restyle/css'

import { getThemeColors } from '../../utils/get-theme-colors'
import { getContext } from '../../utils/context'
import type { GetTokens } from '../../utils/get-tokens'
import { Context } from './Context'
import { QuickInfo } from './QuickInfo'
import { QuickInfoProvider } from './QuickInfoProvider'
import { Symbol } from './Symbol'

export type TokensProps = {
  /** Syntax highlighted tokens from `getTokens` to render. */
  tokens?: Awaited<ReturnType<GetTokens>>

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

/** Renders syntax highlighted tokens for the `CodeBlock` component. */
export async function Tokens({
  tokens: tokensProp,
  renderLine,
  css: cssProp = {},
  className = {},
  style = {},
}: TokensProps) {
  const context = getContext(Context)
  const theme = await getThemeColors()
  const tokens = tokensProp || context?.tokens

  if (!tokens) {
    throw new Error(
      '[mdxts] The `Tokens` component must be used within a `CodeBlock` component or provided a `tokens` prop.'
    )
  }

  const lastLineIndex = tokens.length - 1

  return (
    <QuickInfoProvider>
      {tokens.map((line, lineIndex) => {
        const lineChildren = line.map((token) => {
          const hasTextStyles = Boolean(
            token.fontStyle || token.fontWeight || token.textDecoration
          )
          const hasSymbolMeta = token.diagnostics || token.quickInfo

          if (
            token.isWhitespace ||
            (!hasTextStyles && !hasSymbolMeta && token.isBaseColor)
          ) {
            return token.value
          }

          const tokenStyles = {
            fontStyle: token.fontStyle,
            fontWeight: token.fontWeight,
            textDecoration: token.textDecoration,
            color: token.isBaseColor ? undefined : token.color,
          } satisfies CSSObject

          if (hasSymbolMeta) {
            const diagnosticStyles = {
              backgroundImage: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'bottom left',
            }
            const [symbolClassName, Styles] = css({
              ...tokenStyles,
              ...(token.diagnostics && diagnosticStyles),
              ...cssProp.token,
            })

            return (
              <Symbol
                key={token.start}
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

          const [classNames, Styles] = css(tokenStyles)

          return (
            <span
              key={token.start}
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
