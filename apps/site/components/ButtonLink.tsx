import { styled } from 'restyle'
import Link from 'next/link'

const sizes = {
  primary: {
    fontSize: 'var(--font-size-button-1)',
    padding: '0 1.5rem',
    height: '2lh',
  },
  secondary: {
    fontSize: 'var(--font-size-button-2)',
    padding: '0 1rem',
    height: '1.5lh',
  },
}

export const ButtonLink = styled(
  Link,
  ({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) => {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
      borderRadius: '0.25rem',
      backgroundColor: 'var(--color-surface-primary)',
      color: 'var(--color-foreground)',
      ...sizes[variant],

      ':hover': {
        backgroundColor: 'var(--color-surface-primary-highlighted)',
        textDecoration: 'none !important',
      },

      '@media (min-width: 60rem)': {
        padding: '0 1.5rem',
      },
    }
  }
)
