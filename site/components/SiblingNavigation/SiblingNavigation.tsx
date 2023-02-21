import { usePathname } from 'next/navigation'
import { getPathData } from 'mdxts/utils'
import allData from 'mdxts/docs'

export function SiblingNavigation() {
  const pathname = usePathname()
  const { previous, next } = getPathData(allData, pathname)

  return (
    <nav style={{ display: 'flex', padding: '4rem 0 2rem' }}>
      {previous ? <a href={`/${previous.slug}`}>{previous.name}</a> : null}
      <div style={{ flex: 1 }} />
      {next ? <a href={`/${next.slug}`}>{next.name}</a> : null}
    </nav>
  )
}
