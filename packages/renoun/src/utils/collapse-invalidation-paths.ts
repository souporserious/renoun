interface CollapseInvalidationPathOptions {
  normalizePath?: (path: string) => string
}

export function collapseInvalidationPaths(
  paths: Iterable<string>,
  options: CollapseInvalidationPathOptions = {}
): string[] {
  const normalizePath = options.normalizePath
  const normalizedPaths = Array.from(
    new Set(
      Array.from(paths)
        .filter((path): path is string => {
          return typeof path === 'string' && path.length > 0
        })
        .map((path) => (normalizePath ? normalizePath(path) : path))
        .filter((path) => path.length > 0)
    )
  )
  if (normalizedPaths.length === 0) {
    return []
  }

  if (normalizedPaths.includes('.')) {
    return ['.']
  }

  normalizedPaths.sort((firstPath, secondPath) => {
    if (firstPath.length !== secondPath.length) {
      return firstPath.length - secondPath.length
    }

    return firstPath.localeCompare(secondPath)
  })

  const collapsedPaths: string[] = []
  for (const path of normalizedPaths) {
    const isRedundant = collapsedPaths.some((existingPath) => {
      return path === existingPath || path.startsWith(`${existingPath}/`)
    })

    if (!isRedundant) {
      collapsedPaths.push(path)
    }
  }

  return collapsedPaths
}
