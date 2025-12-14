import { styled } from 'restyle'

export interface BoxProps {
  padding?: number | string
  backgroundColor?: string
  color?: string
}

export const Box = styled('div', (props: BoxProps) => ({
  padding: props.padding,
  backgroundColor: props.backgroundColor,
  color: props.color,
}))
