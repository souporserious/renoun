import { sep } from 'path'

/** Finds the common root path for a set of paths. */
export function findCommonRootPath(paths: string[]) {
  let pathSegments = paths.map((path) => path.split(sep))

  // Find the shortest path to limit the comparison
  let shortestPath = pathSegments.reduce((a, b) =>
    a.length < b.length ? a : b
  )
  let commonRoot = []

  for (let index = 0; index < shortestPath.length; index++) {
    if (
      pathSegments.every((segments) => segments[index] === shortestPath[index])
    ) {
      commonRoot.push(shortestPath[index])
    } else {
      break
    }
  }

  return commonRoot.join(sep)
}
