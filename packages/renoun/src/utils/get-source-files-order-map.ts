import type { Directory } from 'ts-morph'

/** Returns a map of source file paths to their sort order. */
export function getSourceFilesOrderMap(
  directory: Directory
): Map<string, string> {
  const orderMap = new Map<string, string>([[directory.getPath(), '00']])
  traverseDirectory(directory, '', orderMap)
  return orderMap
}

/** Recursively traverses a directory adding each file and directory to a path order map. */
function traverseDirectory(
  directory: Directory,
  prefix: string,
  orderMap: Map<string, string>,
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
    entries.push({
      name: file.getBaseNameWithoutExtension(),
      path: file.getFilePath(),
    })
  })

  entries.sort((a, b) => {
    // Prioritize 'index' or 'readme' files
    const aIsIndexOrReadme = /^(index|readme)/i.test(a.name)
    const bIsIndexOrReadme = /^(index|readme)/i.test(b.name)

    if (aIsIndexOrReadme && !bIsIndexOrReadme) return -1
    if (!aIsIndexOrReadme && bIsIndexOrReadme) return 1

    // Sort alphabetically by name otherwise
    return a.name.localeCompare(b.name)
  })

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
        level + 1,
        1
      )
    } else {
      orderMap.set(entry.path, orderString)
    }

    index++
  }
}
