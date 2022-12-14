import styled from 'styled-components'

export type StackProps = {
  gridColumn?: string
  flexDirection?: 'row' | 'column'
  alignItems?: keyof typeof alignments
  justifyContent?: keyof typeof distributions | 'fill'
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
  background?: string
}

export const Stack = styled.div<StackProps>(
  (props) => ({
    display: 'flex',
    gridColumn: props.gridColumn,
    flexDirection: props.flexDirection || 'column',
    minWidth: props.minWidth ?? 0,
    maxWidth: props.maxWidth,
    minHeight: props.minHeight,
    maxHeight: props.maxHeight,
    padding: props.padding,
    paddingInline: props.paddingX,
    paddingInlineStart: props.paddingXStart,
    paddingInlineEnd: props.paddingXEnd,
    paddingBlock: props.paddingY,
    paddingBlockStart: props.paddingYStart,
    paddingBlockEnd: props.paddingYEnd,
    gap: props.gap,
    alignItems: props.alignItems ? alignments[props.alignItems] : undefined,
    justifyContent:
      props.justifyContent === 'fill'
        ? undefined
        : props.justifyContent
        ? distributions[props.justifyContent]
        : undefined,
    background: props.background,
    ...getSize('width', props.width),
    ...getSize('height', props.height),
  }),
  (props) =>
    props.justifyContent === 'fill' && {
      '& > *': { flex: '1 0 0px' },
    }
)

const alignments = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}

const distributions = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
  'space-evenly': 'space-evenly',
}

const getSize = (
  side: 'width' | 'height',
  value: string | number | undefined
) => {
  if (typeof value === 'string' && value.includes('fr')) {
    const fractionalValue = parseInt(value, 10)
    return {
      flexGrow: fractionalValue,
      flexShrink: fractionalValue,
      flexBasis: '0',
    }
  } else {
    return {
      [side]: value,
    }
  }
}
