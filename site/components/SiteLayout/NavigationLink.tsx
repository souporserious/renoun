'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function NavigationLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const currentPathname = usePathname()
  const isCurrent = currentPathname.startsWith(href)

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
