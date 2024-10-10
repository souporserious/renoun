import { styled } from 'restyle'
import Link from 'next/link'

export const ButtonLink = styled(Link, {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  minHeight: '2.1715rem',
  padding: '0.5rem 1.25rem',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--color-surface-primary)',
  color: 'var(--color-foreground)',
  fontSize: 'var(--font-size-button)',

  ':hover': {
    backgroundColor: 'var(--color-surface-primary-highlighted)',
    textDecoration: 'none !important',
  },

  '@media (min-width: 60rem)': {
    padding: '0 0.75rem',
  },
})
