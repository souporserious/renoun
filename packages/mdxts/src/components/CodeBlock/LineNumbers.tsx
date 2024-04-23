import React, { Fragment } from 'react'

import { getTheme } from '../Tokens/get-theme'
import { getTokens } from '../Tokens/get-tokens'

export async function LineNumbers({
  tokens,
  highlightRanges,
  className,
  style,
}: {
  /** Tokens to render from `getTokens`. */
  tokens: Awaited<ReturnType<typeof getTokens>>

  /** A string of comma separated lines and ranges to highlight. */
  highlightRanges?: string

  /** Class name to apply to the line numbers container. */
  className?: string

  /** Style to apply to the line numbers container. */
  style?: React.CSSProperties
}) {
  const theme = await getTheme()
  const shouldHighlightLine = calculateLinesToHighlight(highlightRanges)

  return (
    <div
      className={className}
      style={{
        position: 'sticky',
        left: 0,
        textAlign: 'right',
        userSelect: 'none',
        whiteSpace: 'pre',
        backgroundColor: 'inherit',
        color: theme.colors['editorLineNumber.foreground'],
        ...style,
      }}
    >
      {tokens.map((_: any, lineIndex: number) => {
        const shouldHighlight = shouldHighlightLine(lineIndex)

        if (shouldHighlight) {
          return (
            <span
              style={{
                color: theme.colors['editorLineNumber.activeForeground'],
              }}
            >
              {lineIndex + 1}
            </span>
          )
        }

        return (
          <Fragment key={lineIndex}>
            {lineIndex + 1}
            {'\n'}
          </Fragment>
        )
      })}
    </div>
  )
}

/** Calculate which lines to highlight based on the range meta string added by the rehype plugin. */
export function calculateLinesToHighlight(ranges: string | undefined) {
  if (ranges === '' || ranges === undefined) {
    return () => false
  }

  const lineNumbers = ranges
    .split(',')
    .map((value: string) => value.split('-').map((y) => parseInt(y, 10)))

  return (index: number) => {
    const lineNumber = index + 1
    const inRange = lineNumbers.some(([start, end]: number[]) =>
      end ? lineNumber >= start && lineNumber <= end : lineNumber === start
    )
    return inRange
  }
}
