import React from 'react'
import { getTheme } from '../Tokens'

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

export async function LineHighlights({
  highlightRanges,
  theme: themeProp,
  style,
}: {
  highlightRanges: string
  theme: string
  style?: React.CSSProperties
}) {
  const theme = await getTheme(themeProp)

  return getHighlights(highlightRanges).map((highlight, index) => {
    return (
      <div
        key={index}
        style={{
          position: 'absolute',
          top: `calc(${highlight.start} * 1lh)`,
          left: 0,
          width: '100%',
          height: `calc(${highlight.height} * 1lh)`,
          backgroundColor: theme.colors['editor.rangeHighlightBackground'],
          pointerEvents: 'none',
          ...style,
        }}
      />
    )
  })
}
