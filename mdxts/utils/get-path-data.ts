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

    if (siblingPath?.slug === null) {
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
