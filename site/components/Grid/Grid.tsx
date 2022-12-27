import styled from 'styled-components'

export type GridProps = {
  gridColumn?: string
  gridTemplateColumns?: string
  gridTemplateRows?: string
  alignItems?: 'start' | 'center' | 'end'
  justifyItems?: 'start' | 'center' | 'end'
  placeItems?: 'start' | 'center' | 'end'
  width?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  height?: number | string
  minHeight?: number | string
  maxHeight?: number | string
  padding?: number | string
  paddingX?: number | string
  paddingXStart?: number | string
  paddingXEnd?: number | string
  paddingY?: number | string
  paddingYStart?: number | string
  paddingYEnd?: number | string
  gap?: number | string
  columnGap?: number | string
  rowGap?: number | string
  background?: string
}

export const Grid = styled.div<GridProps>((props) => ({
  display: 'grid',
  gridColumn: props.gridColumn,
  gridTemplateColumns: props.gridTemplateColumns,
  gridTemplateRows: props.gridTemplateRows,
  alignItems: props.alignItems,
  justifyItems: props.justifyItems,
  width: props.width,
  minWidth: props.minWidth ?? 0,
  maxWidth: props.maxWidth,
  height: props.height,
  minHeight: props.minHeight ?? 0,
  maxHeight: props.maxHeight,
  padding: props.padding,
  paddingInline: props.paddingX,
  paddingInlineStart: props.paddingXStart,
  paddingInlineEnd: props.paddingXEnd,
  paddingBlock: props.paddingY,
  paddingBlockStart: props.paddingYStart,
  paddingBlockEnd: props.paddingYEnd,
  gap: props.gap,
  columnGap: props.columnGap,
  rowGap: props.rowGap,
  background: props.background,
}))
