'use client'
import type { ComponentProps } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { css, type CSSObject } from 'restyle'

export function NavigationLink({
  href,
  activeColor = 'var(--color-foreground)',
  activePathnames,
  css: cssProp,
  className,
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
    fontSize: 'var(--font-size-body-2)',
    whiteSpace: 'nowrap',
    ...cssProp,
  }

  if (isActive) {
    styles.color = activeColor
    styles.textShadow = '0.01em 0 currentColor,-0.01em 0 currentColor'
  } else {
    styles.color = cssProp?.color || 'var(--color-foreground-interactive)'
    styles[':hover'] = {
      color: 'var(--color-foreground-interactive-highlighted)',
      ...(cssProp?.[':hover'] as CSSObject),
    }
  }

  const [classNames, Styles] = css(styles)

  return (
    <Link
      href={href}
      className={className ? `${classNames} ${className}` : classNames}
      {...props}
    >
      {children}
      <Styles />
    </Link>
  )
}
