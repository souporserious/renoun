import { styled } from 'restyle'
import Link from 'next/link'

const CardLink = styled(Link, {
  display: 'block',
  padding: '1.5rem',
  borderRadius: 5,
  boxShadow: '0 0 0 1px var(--color-separator)',
  backgroundColor: 'var(--color-surface-interactive)',
  color: 'var(--color-foreground)',
  fontWeight: 'var(--font-weight-button)',
  textDecoration: 'none',
  transition: 'background-color 0.2s',
  '&:hover': {
    backgroundColor: 'var(--color-surface-interactive-highlighted)',
  },
})

export function Card({
  label,
  href,
}: {
  label: React.ReactNode
  href: string
}) {
  if (href) {
    return <CardLink href={href}>{label}</CardLink>
  }

  return (
    <div
      css={{
        padding: '1.5rem',
        borderRadius: 5,
        boxShadow: '0 0 0 1px var(--color-separator)',
        backgroundColor: 'var(--color-background)',
      }}
    >
      {label}
    </div>
  )
}
