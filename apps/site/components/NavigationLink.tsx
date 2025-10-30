'use client'
import type { ComponentProps } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { styled, type CSSObject } from 'restyle'

const StyledLink = styled(Link, {
  fontSize: 'var(--font-size-body-2)',
  padding: '0.25rem 0.5rem',
  whiteSpace: 'nowrap',
})

export function NavigationLink({
  href,
  activeColor = 'var(--color-foreground)',
  activePathnames,
  css,
  children,
  ...props
}: {
  href: string
  activeColor?: string
  activePathnames?: string[]
  css?: CSSObject
  children: React.ReactNode
} & Omit<ComponentProps<typeof Link>, 'href' | 'children'>) {
  const activePathname = usePathname()
  const isActive = activePathnames
    ? activePathnames.find((pathname) => activePathname.startsWith(pathname))
    : activePathname.startsWith(href)
  const styles: CSSObject = {
    display: 'block',
    padding: '0.5rem 0.75rem',
  }

  if (isActive) {
    styles.color = activeColor
    styles.textShadow = '0.01em 0 currentColor,-0.01em 0 currentColor'
  } else {
    styles.color = css?.color ?? 'var(--color-foreground-interactive)'
    styles[':hover'] = {
      color: 'var(--color-foreground-interactive-highlighted)',
      ...(css?.[':hover'] as CSSObject),
    }
  }

  return (
    <StyledLink href={href} css={{ ...styles, ...css }} {...props}>
      {children}
    </StyledLink>
  )
}
