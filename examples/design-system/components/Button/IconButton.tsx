import { styled } from 'restyle'

import { type ButtonProps, variants } from './Button'

/** Allows users to take specific actions using a simplified icon graphic. */
export const IconButton = styled(
  'button',
  ({ color, backgroundColor, variant = 'primary' }: ButtonProps) => {
    const variantProps = variants[variant] || {}

    return {
      appearance: 'none',
      backgroundColor: backgroundColor || variantProps.backgroundColor,
      color: color || variantProps.color,
    }
  }
)
