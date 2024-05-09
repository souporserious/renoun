import React from 'react'

import { getThemeColors } from '../../index'
import { getContext } from '../../utils/context'
import { Context } from './Context'
import type { HighlightBlock } from './utils'
import { getHighlights } from './utils'

/** Renders a highlight over a range of `CodeBlock` lines. */
export async function LineHighlights({
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
  const theme = await getThemeColors()
  const highlightRanges = highlightRangesProp || context?.highlightedLines

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
          left: context?.padding ? `-${context?.padding}` : 0,
          zIndex: 1,
          gridColumn: '1 / -1',
          gridRow: `${highlight.start + 1} / span ${highlight.height}`,
          backgroundColor: theme.editor.rangeHighlightBackground,
          pointerEvents: 'none',
          ...(typeof style === 'function' ? style(highlight) : style),
        }}
      />
    )
  })
}
