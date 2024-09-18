'use client'
import { styled, type CSSObject } from 'restyle'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const StyledLink = styled(Link, {
  display: 'block',
  padding: '0.25rem 0',
})

export function SidebarLink({
  pathname,
  label,
  css,
}: {
  pathname: string
  label: string
  css?: CSSObject
}) {
  const activePathname = usePathname()
  const isActive = pathname === activePathname
  const styles: CSSObject = {
    display: 'block',
    padding: '0.25rem 0',
  }

  if (isActive) {
    styles.color = 'var(--color-foreground)'
  } else {
    styles.color = 'var(--color-foreground-interactive)'
    styles[':hover'] = {
      color: 'var(--color-foreground-interactive-highlighted)',
    }
  }

  return (
    <StyledLink href={pathname} css={{ ...styles, ...css }}>
      {label}
    </StyledLink>
  )
}
