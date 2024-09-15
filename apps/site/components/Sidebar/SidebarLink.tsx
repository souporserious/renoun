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
  name,
  css,
}: {
  pathname: string
  name: string
  css?: CSSObject
}) {
  const activePathname = usePathname()
  const isActive = pathname === activePathname

  return (
    <StyledLink
      href={pathname}
      css={{
        display: 'block',
        padding: '0.25rem 0',
        color: isActive
          ? 'var(--color-foreground)'
          : 'var(--color-foreground-interactive)',
        ...css,
      }}
    >
      {name}
    </StyledLink>
  )
}
