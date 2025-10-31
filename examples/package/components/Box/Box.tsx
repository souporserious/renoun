import { styled } from 'restyle'

export type BoxProps = {
  padding?: number | string
  backgroundColor?: string
  color?: string
}

export const Box = styled('div', (props: BoxProps) => ({
  padding: props.padding,
  backgroundColor: props.backgroundColor,
  color: props.color,
}))
