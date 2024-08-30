import { posix } from 'path'

/** Finds the first shared directory path for a set of paths. */
export function getSharedDirectoryPath(...paths: string[]) {
  let pathSegments = paths.map((path) => path.split(posix.sep))

  if (pathSegments.length === 0) {
    throw new Error('omnidoc: cannot find common root path for empty array')
  }

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

  if (commonRoot.length > 1 && commonRoot.at(-1)!.includes('.')) {
    commonRoot.pop()
  }

  return commonRoot.join(posix.sep)
}
