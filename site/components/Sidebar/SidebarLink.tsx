'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Text } from 'components/Text'

export function SidebarLink({
  pathname,
  name,
}: {
  pathname: string
  name: string
}) {
  const currentPathname = usePathname()

  return (
    <Link
      href={pathname}
      style={{
        display: 'block',
        padding: '0.25rem 0',
        color: pathname === currentPathname ? 'white' : '#8e9491',
      }}
    >
      <Text>{name}</Text>
    </Link>
  )
}
