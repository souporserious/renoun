import * as React from 'react'
import { Box } from '../Box'

export const variants = {
  primary: {
    backgroundColor: '#0070f3',
    color: '#fff',
  },
  secondary: {
    backgroundColor: '#fff',
    color: '#0070f3',
  },
}

export type ButtonProps = {
  children?: React.ReactNode
  backgroundColor?: string
  color?: string
  variant: 'primary' | 'secondary'
  style?: React.CSSProperties
}

/**
 * Button allows users to take specific actions.
 */
export function Button({
  variant = 'primary',
  backgroundColor: propsBackgroundColor,
  color: propsColor,
  children,
  style,
  ...props
}: ButtonProps) {
  const { backgroundColor, color } = variants[variant] || {}
  return (
    <Box
      as="button"
      {...props}
      style={{
        ...style,
        appearance: 'none',
        backgroundColor: propsBackgroundColor || backgroundColor,
        color: propsColor || color,
      }}
    >
      {children}
    </Box>
  )
}
