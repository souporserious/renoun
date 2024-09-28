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
  activeColor = 'var(--color-foreground)',
  activePathnames,
  css,
  children,
}: {
  href: string
  activeColor?: string
  activePathnames?: string[]
  css?: CSSObject
  children: React.ReactNode
}) {
  const activePathname = usePathname()
  const isActive = activePathnames
    ? activePathnames.find((pathname) => activePathname.startsWith(pathname))
    : activePathname.startsWith(href)
  const styles: CSSObject = {
    display: 'block',
    padding: '0.25rem 0',
  }

  if (isActive) {
    styles.fontWeight = 600
    styles.color = activeColor
  } else {
    styles.color = css?.color ?? 'var(--color-foreground-interactive)'
    styles[':hover'] = {
      color: 'var(--color-foreground-interactive-highlighted)',
      ...(css?.[':hover'] as CSSObject),
    }
  }

  return (
    <StyledLink href={href} css={{ ...styles, ...css }}>
      {children}
    </StyledLink>
  )
}
