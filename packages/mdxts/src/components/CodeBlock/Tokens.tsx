import React, { Fragment } from 'react'

import { getContext } from '../../utils/context'
import { Context } from './Context'
import { QuickInfo } from './QuickInfo'
import { QuickInfoProvider } from './QuickInfoProvider'
import { Symbol } from './Symbol'
import type { GetTokens } from './get-tokens'
import { getTheme } from './get-theme'

export type TokensProps = {
  tokens?: Awaited<ReturnType<GetTokens>>
  style?: {
    token?: React.CSSProperties
    popover?: React.CSSProperties
  }
  renderLine?: (line: {
    children: React.ReactNode
    index: number
    isLast: boolean
  }) => React.ReactNode
}

export async function Tokens({
  tokens: tokensProp,
  renderLine,
  style = {},
}: TokensProps) {
  const context = getContext(Context)
  const theme = getTheme()
  const tokens = tokensProp || context?.tokens

  if (!tokens) {
    throw new Error(
      '[mdxts] `LineNumbers` must be provided a `tokens` prop or used inside a `CodeBlock` component.'
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
            !hasTextStyles &&
            !hasSymbolMeta &&
            (token.isBaseColor || token.isWhitespace)
          ) {
            return token.value
          }

          const tokenStyles: React.CSSProperties = {
            fontStyle: token.fontStyle,
            fontWeight: token.fontWeight,
            textDecoration: token.textDecoration,
            color: token.isBaseColor ? undefined : token.color,
            ...style.token,
          }

          if (hasSymbolMeta) {
            const diagnosticStyles = {
              backgroundImage: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'bottom left',
            }

            return (
              <Symbol
                highlightColor={theme.colors['editor.hoverHighlightBackground']}
                popover={
                  <QuickInfo
                    diagnostics={token.diagnostics}
                    quickInfo={token.quickInfo}
                    style={style.popover}
                  />
                }
                style={{
                  ...tokenStyles,
                  ...(token.diagnostics && diagnosticStyles),
                }}
              >
                {token.value}
              </Symbol>
            )
          }

          return (
            <span key={token.start} style={tokenStyles}>
              {token.value}
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
