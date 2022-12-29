'use client'

import allDocs from 'mdxts/docs'
import { usePathname } from 'next/navigation'

export function SiblingNavigation() {
  const pathname = usePathname()
  const paths = getPathData(allDocs, pathname)

  return (
    <nav style={{ display: 'flex', padding: '2rem 0 1rem' }}>
      {paths.previous ? (
        <a href={paths.previous.slug}>{paths.previous.name}</a>
      ) : null}
      <div style={{ flex: 1 }} />
      {paths.next ? <a href={paths.next.slug}>{paths.next.name}</a> : null}
    </nav>
  )
}

/**
 * Returns the active and sibling data based on the active slug.
 */
export function getPathData(allData: any[], activeSlug: string) {
  const data = Object.values(allData) as any[]
  const activePathIndex = data.findIndex(
    (data) => data.slug === activeSlug.replace('/', '')
  )

  function getSiblingPath(startIndex: number, direction: number) {
    const siblingIndex = startIndex + direction
    const siblingPath = data[siblingIndex]

    if (siblingPath?.slug === null) {
      return getSiblingPath(siblingIndex, direction)
    }

    return siblingPath || null
  }

  return {
    active: data[activePathIndex] || null,
    previous: getSiblingPath(activePathIndex, -1),
    next: getSiblingPath(activePathIndex, 1),
  }
}
