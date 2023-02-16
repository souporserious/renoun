/** Returns the active and sibling data based on the active pathname. */
export function getPathData(
  /** The collected data from the specified mdxts loaders. */
  allData: any[],

  /** The pathname of the active page. */
  pathname: string
) {
  const data = Object.values(allData) as any[]
  const index = data.findIndex((data) => data.pathname === pathname)

  function getSiblingPath(startIndex: number, direction: number) {
    const siblingIndex = startIndex + direction
    const siblingPath = data[siblingIndex]

    if (siblingPath?.slug === null) {
      return getSiblingPath(siblingIndex, direction)
    }

    return siblingPath || null
  }

  return {
    active: data[index] || null,
    previous: getSiblingPath(index, -1),
    next: getSiblingPath(index, 1),
  }
}
