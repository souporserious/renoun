'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function NavigationLink({
  href,
  activePathnames,
  children,
}: {
  href: string
  activePathnames?: string[]
  children: React.ReactNode
}) {
  const currentPathname = usePathname()
  const isCurrent = activePathnames
    ? activePathnames.some((pathname) => currentPathname.startsWith(pathname))
    : currentPathname.startsWith(href)

  return (
    <Link
      href={href}
      style={{
        fontSize: 'var(--font-size-body-2)',
        fontWeight: isCurrent ? 600 : undefined,
        padding: '0.25rem 0.5rem',
        color: isCurrent
          ? 'var(--color-foreground)'
          : 'var(--color-foreground-interactive)',
      }}
    >
      {children}
    </Link>
  )
}
