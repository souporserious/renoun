'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Text } from 'components/Text'

export function SidebarLink({
  pathname,
  name,
  hasData,
}: {
  pathname: string
  name: string
  hasData: boolean
}) {
  const currentPathname = usePathname()
  const isCurrent = hasData ? pathname === currentPathname : false

  return (
    <Link
      href={pathname}
      style={{
        display: 'block',
        padding: '0.25rem 0',
        color: isCurrent ? 'white' : 'var(--color-foreground-interactive)',
      }}
    >
      <Text>{name}</Text>
    </Link>
  )
}
