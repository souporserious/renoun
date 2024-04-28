import React from 'react'

import { getThemeColors } from '../../index'
import { getContext } from '../../utils/context'
import { Context } from './Context'

export function getHighlights(ranges: string) {
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

export function LineHighlights({
  highlightRanges: highlightRangesProp,
  offsetTop,
  style,
}: {
  highlightRanges?: string
  offsetTop?: string | number
  style?: React.CSSProperties
}) {
  const context = getContext(Context)
  const theme = getThemeColors()
  const highlightRanges = highlightRangesProp || context?.highlight

  if (!highlightRanges) {
    throw new Error(
      '`LineHighlights` requires a `highlightRanges` prop or to be nested in a `CodeBlock` component.'
    )
  }

  if (!offsetTop) {
    offsetTop = context?.padding
  }

  if (typeof offsetTop === 'number') {
    offsetTop = `${offsetTop}px`
  }

  return getHighlights(highlightRanges).map((highlight, index) => {
    return (
      <div
        key={index}
        style={{
          position: 'absolute',
          top: `calc(${highlight.start} * 1lh + ${offsetTop})`,
          left: 0,
          width: '100%',
          height: `calc(${highlight.height} * 1lh)`,
          backgroundColor: theme.editor.rangeHighlightBackground,
          pointerEvents: 'none',
          ...style,
        }}
      />
    )
  })
}
