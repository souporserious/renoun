import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { getResolvedContext } from './Context.js'

export interface LineNumbersProps {
  /** A string of comma separated lines and ranges to highlight. */
  highlightRanges?: string

  /** CSS object to apply to the line numbers container. */
  css?: CSSObject

  /** Class name to apply to the line numbers container. */
  className?: string

  /** Style to apply to the line numbers container. */
  style?: React.CSSProperties
}

/** Renders line numbers for the `CodeBlock` component. */
export async function LineNumbers({
  highlightRanges: highlightRangesProp,
  css,
  className,
  style,
}: LineNumbersProps) {
  const context = await getResolvedContext()
  const config = getConfig()
  const theme = await getThemeColors(config.theme)
  const highlightRanges = highlightRangesProp || context?.highlightedLines
  const shouldHighlightLine = calculateLinesToHighlight(highlightRanges)

  return (
    <Container
      css={{ color: theme.editorLineNumber.foreground, ...css }}
      className={className}
      style={style}
    >
      {context.value.split('\n').map((_: any, lineIndex: number) => {
        const shouldHighlight = shouldHighlightLine(lineIndex)
        const content = shouldHighlight ? (
          <Highlighted css={{ color: theme.editorLineNumber.activeForeground }}>
            {lineIndex + 1}
          </Highlighted>
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
    </Container>
  )
}

const Container = styled('span', {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  textAlign: 'right',
  userSelect: 'none',
  whiteSpace: 'pre',
  backgroundColor: 'inherit',
})

const Highlighted = styled('span')

/** Calculate which lines to highlight based on the range meta string added by the rehype plugin. */
export function calculateLinesToHighlight(ranges: string | undefined) {
  if (ranges === '' || ranges === undefined) {
    return () => false
  }

  const showLineNumbers = ranges
    .split(',')
    .map((value: string) => value.split('-').map((y) => parseInt(y, 10)))

  return (index: number) => {
    const lineNumber = index + 1
    const inRange = showLineNumbers.some(([start, end]: number[]) =>
      end ? lineNumber >= start && lineNumber <= end : lineNumber === start
    )
    return inRange
  }
}
