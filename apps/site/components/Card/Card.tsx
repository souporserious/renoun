import { styled } from 'restyle'

const cardVariants = {
  outlined: {
    border: '1px solid rgba(0, 0, 0, 0.12)',
  },
  elevated: {
    boxShadow: '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)',
  },
} as const

export type CardProps = {
  padding?: React.CSSProperties['padding']
  variant: keyof typeof cardVariants
}

export const Card = styled(
  'div',
  ({ padding = '1rem', variant = 'outlined' }: CardProps) => {
    const variantStyle = cardVariants[variant]

    return {
      padding,
      ...variantStyle,
    }
  }
)
