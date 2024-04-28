import React from 'react'

import { getThemeColors } from '../../index'
import { getContext } from '../../utils/context'
import { Context } from './Context'

export type HighlightBlock = {
  start: number
  end: number
  height: number
}

/** Parses a string of comma separated line ranges into an array of highlight blocks. */
export function getHighlights(ranges: string): HighlightBlock[] {
  return ranges.split(',').map((range) => {
    const [start, end] = range.split('-')
    const parsedStart = parseInt(start, 10) - 1
    const parsedEnd = end ? parseInt(end, 10) - 1 : parsedStart

    return {
      start: parsedStart,
      end: parsedEnd,
      height: parsedEnd - parsedStart + 1,
    }
  })
}

/** Renders a highlight over a range of grid lines. */
export function LineHighlights({
  highlightRanges: highlightRangesProp,
  className,
  style,
}: {
  /** A string of comma separated lines and ranges to highlight e.g. `'1, 3-5, 7'`. */
  highlightRanges?: string
  /** Class name to apply to the highlight element. */
  className?: string | ((highlight: HighlightBlock) => string)
  /** Styles to apply to the highlight element. */
  style?:
    | React.CSSProperties
    | ((highlight: HighlightBlock) => React.CSSProperties)
}) {
  const context = getContext(Context)
  const theme = getThemeColors()
  const highlightRanges = highlightRangesProp || context?.highlight

  if (!highlightRanges) {
    throw new Error(
      '`LineHighlights` requires a `highlightRanges` prop or to be nested in a `CodeBlock` component.'
    )
  }

  return getHighlights(highlightRanges).map((highlight, index) => {
    return (
      <div
        key={index}
        className={
          typeof className === 'function' ? className(highlight) : className
        }
        style={{
          position: 'sticky',
          left: context?.padding ? `calc(${context?.padding} * -1)` : 0,
          zIndex: 1,
          gridColumn: '1 / -1',
          gridRow: `${highlight.start + 1} / span ${highlight.height}`,
          margin: context?.padding
            ? `0 calc(${context.padding} * -2)`
            : undefined,
          backgroundColor: theme.editor.rangeHighlightBackground,
          pointerEvents: 'none',
          ...(typeof style === 'function' ? style(highlight) : style),
        }}
      />
    )
  })
}
