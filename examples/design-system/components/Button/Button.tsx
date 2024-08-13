import { styled } from 'restyle'

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

/** Allow users to take specific actions. */
export const Button = styled(
  'button',
  ({ backgroundColor, color, variant = 'primary' }: ButtonProps) => {
    const variantProps = variants[variant] || {}

    return {
      appearance: 'none',
      backgroundColor: backgroundColor || variantProps.backgroundColor,
      color: color || variantProps.color,
    }
  }
)
