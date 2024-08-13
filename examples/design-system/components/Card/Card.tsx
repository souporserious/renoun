import * as React from 'react'
import { Box } from '../Box'

export type CardProps = {
  children: React.ReactNode
  variant: 'default' | 'outlined' | 'elevated' | 'flat'
  style?: React.CSSProperties
}

const cardVariants = {
  default: {
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
  },
  outlined: {
    backgroundColor: 'white',
    border: '1px solid rgba(0, 0, 0, 0.12)',
  },
  elevated: {
    backgroundColor: 'white',
    boxShadow: '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)',
  },
  flat: {
    backgroundColor: 'white',
  },
}

export function Card({
  variant = 'default',
  children,
  style,
  ...props
}: CardProps) {
  const variantStyle = cardVariants[variant]

  return (
    <Box
      {...props}
      padding="1rem"
      style={{
        ...variantStyle,
        ...style,
      }}
    >
      {children}
    </Box>
  )
}
