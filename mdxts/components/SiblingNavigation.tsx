import * as React from 'react'

/** Returns the active and sibling data based on the active pathname. */
export function getPathData(
  /** The collected data from a source. */
  data: Record<string, any>,

  /** The pathname of the active page. */
  pathname: string[]
) {
  const allData = Object.values(data) as any[]
  const index = Object.keys(data).findIndex((dataPathname) =>
    dataPathname.includes(pathname.join('/'))
  )

  function getSiblingPath(startIndex: number, direction: number) {
    const siblingIndex = startIndex + direction
    const siblingPath = allData[siblingIndex]

    if (siblingPath?.pathname === null) {
      return getSiblingPath(siblingIndex, direction)
    }

    return siblingPath || null
  }

  return {
    active: allData[index] || null,
    previous: getSiblingPath(index, -1),
    next: getSiblingPath(index, 1),
  }
}

/** Renders previous and next links. */
export function SiblingNavigation({
  data,
  pathname,
}: {
  data: Record<string, any>
  pathname: string[]
}) {
  const { previous, next } = getPathData(data, pathname)
  return (
    <nav style={{ display: 'flex', padding: '4rem 0 2rem' }}>
      {previous ? (
        <a href={`/${previous.pathname.replace('docs/', '')}`}>
          {previous.title}
        </a>
      ) : null}
      <div style={{ flex: 1 }} />
      {next ? (
        <a href={`/${next.pathname.replace('docs/', '')}`}>{next.title}</a>
      ) : null}
    </nav>
  )
}
