import React, { Fragment } from 'react'

import { getThemeColors } from '../../index'
import { getContext } from '../../utils/context'
import type { getTokens } from './get-tokens'
import { Context } from './Context'

/** Renders line numbers for the `CodeBlock` component. */
export function LineNumbers({
  tokens: tokensProp,
  highlightRanges: highlightRangesProp,
  className,
  style,
}: {
  /** Tokens to render from `getTokens`. */
  tokens?: Awaited<ReturnType<typeof getTokens>>

  /** A string of comma separated lines and ranges to highlight. */
  highlightRanges?: string

  /** Class name to apply to the line numbers container. */
  className?: string

  /** Style to apply to the line numbers container. */
  style?: React.CSSProperties
}) {
  const context = getContext(Context)
  const tokens = tokensProp || context?.tokens

  if (!tokens) {
    throw new Error(
      '[mdxts] `LineNumbers` must be provided a `tokens` prop or used inside a `CodeBlock` component.'
    )
  }

  const theme = getThemeColors()
  const highlightRanges = highlightRangesProp || context?.highlight
  const shouldHighlightLine = calculateLinesToHighlight(highlightRanges)

  return (
    <div
      className={className}
      style={{
        position: 'sticky',
        left: 0,
        zIndex: 1,
        textAlign: 'right',
        userSelect: 'none',
        whiteSpace: 'pre',
        backgroundColor: 'inherit',
        color: theme.editorLineNumber.foreground,
        ...style,
      }}
    >
      {tokens.map((_: any, lineIndex: number) => {
        const shouldHighlight = shouldHighlightLine(lineIndex)
        const content = shouldHighlight ? (
          <span
            style={{
              color: theme.editorLineNumber.activeForeground,
            }}
          >
            {lineIndex + 1}
          </span>
        ) : (
          lineIndex + 1
        )

        return (
          <Fragment key={lineIndex}>
            {content}
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
