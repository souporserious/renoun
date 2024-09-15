'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { styled, type CSSObject } from 'restyle'

const StyledLink = styled(Link, {
  fontSize: 'var(--font-size-body-2)',
  padding: '0.25rem 0.5rem',
})

export function NavigationLink({
  href,
  activePathnames,
  css,
  children,
}: {
  href: string
  activePathnames?: string[]
  css?: CSSObject
  children: React.ReactNode
}) {
  const activePathname = usePathname()
  const isActive = activePathnames
    ? activePathnames.find((pathname) => activePathname.startsWith(pathname))
    : activePathname.startsWith(href)

  return (
    <StyledLink
      href={href}
      css={{
        fontWeight: isActive ? 600 : undefined,
        color: isActive
          ? 'var(--color-foreground)'
          : 'var(--color-foreground-interactive)',
        ...css,
      }}
    >
      {children}
    </StyledLink>
  )
}
