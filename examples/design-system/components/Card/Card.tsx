import { styled } from 'restyle'

export type CardProps = {
  padding?: React.CSSProperties['padding']
  variant: 'default' | 'outlined' | 'elevated' | 'flat'
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

export const Card = styled('div', ({ padding, variant }: CardProps) => {
  const variantStyle = cardVariants[variant]

  return {
    padding,
    ...variantStyle,
  }
})
