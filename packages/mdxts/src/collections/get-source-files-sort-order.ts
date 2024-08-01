import { Directory } from 'ts-morph'

/** Returns a map of source file paths to their sort order. */
export function getSourceFilesOrderMap(
  directory: Directory,
  publicPaths?: string[]
): Map<string, string> {
  const orderMap = new Map<string, string>()
  traverseDirectory(directory, '', orderMap, publicPaths)
  return orderMap
}

/** Recursively traverses a directory adding each file and directory to a path order map. */
function traverseDirectory(
  directory: Directory,
  prefix: string,
  orderMap: Map<string, string>,
  publicPaths?: string[],
  level: number = 1,
  index: number = 1
) {
  const entries: {
    name: string
    path: string
    directory?: Directory
  }[] = []
  const directories = directory.getDirectories()

  directories.forEach((sourceDirectory) => {
    entries.push({
      name: sourceDirectory.getBaseName(),
      path: sourceDirectory.getPath(),
      directory: sourceDirectory,
    })
  })

  const files = directory.getSourceFiles()

  files.forEach((file) => {
    if (!publicPaths || publicPaths.includes(file.getFilePath())) {
      entries.push({
        name: file.getBaseName(),
        path: file.getFilePath(),
      })
    }
  })

  // Sort alphabetically by name
  entries.sort((a, b) => a.name.localeCompare(b.name))

  // Iterate through each entry and assign an order
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex]
    const orderString = `${prefix}${String(index).padStart(2, '0')}`

    if (entry.directory) {
      orderMap.set(entry.path, orderString)

      traverseDirectory(
        entry.directory,
        `${orderString}.`,
        orderMap,
        publicPaths,
        level + 1,
        1
      )
    } else {
      orderMap.set(entry.path, orderString)
    }

    index++
  }
}
