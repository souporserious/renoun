import * as React from 'react'
import { Box, ButtonProps, variants } from 'components'

/**
 * IconButton allows users to take specific actions using a simplified icon graphic.
 */
export function IconButton({
  icon,
  variant = 'primary',
  backgroundColor: propsBackgroundColor,
  color: propsColor,
  style,
  ...props
}: Omit<ButtonProps, 'children'> & { icon: string }) {
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
      {icon}
    </Box>
  )
}
