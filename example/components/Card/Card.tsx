import * as React from 'react'
import { Box } from '../Box'

export type CardProps = {
  children: React.ReactNode
  variant: 'default' | 'outlined' | 'elevated' | 'flat'
  style?: React.CSSProperties
}

export function Card({ variant, children, style, ...props }: CardProps) {
  return (
    <Box {...props} style={style}>
      {children}
    </Box>
  )
}
