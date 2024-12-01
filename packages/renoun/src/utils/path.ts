/** Get the base name of a file system path e.g. /path/to/file.ts -> file */
export function baseName(path: string, extension: string = ''): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  if (extension && base.endsWith(extension)) {
    return base.slice(0, -extension.length)
  }
  return base
}

/** Get the extension from a file path e.g. readme.md -> .md */
export function extensionName(path: string): string {
  const dotIndex = path.lastIndexOf('.')
  const slashIndex = path.lastIndexOf('/')
  if (dotIndex > slashIndex) {
    return path.slice(dotIndex)
  }
  return ''
}

/** Get the directory name from a file path e.g. /path/to/file.ts -> /path/to */
export function directoryName(path: string): string {
  const slashIndex = path.lastIndexOf('/')
  if (slashIndex === -1) return '.'
  if (slashIndex === 0) return '/'
  return path.slice(0, slashIndex)
}

/** Remove the extension from a file path e.g. readme.md -> readme */
export function removeExtension(filePath: string): string {
  const lastDotIndex = filePath.lastIndexOf('.')
  const lastSlashIndex = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\')
  )

  if (lastDotIndex > lastSlashIndex) {
    return filePath.slice(0, lastDotIndex)
  }

  return filePath
}

/** Remove all extensions from a file path e.g. Button.examples.tsx -> Button */
export function removeAllExtensions(filePath: string): string {
  const lastSlashIndex = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\')
  )
  const filenNameStartOffset = 1
  const fileName = filePath.slice(lastSlashIndex + filenNameStartOffset)
  const firstDotIndex = fileName.indexOf('.')

  if (firstDotIndex === -1) {
    return filePath // No extension found
  }

  return filePath.slice(
    0,
    lastSlashIndex + filenNameStartOffset + firstDotIndex
  )
}

/** Remove order prefixes from a file path e.g. 01.intro -> intro */
export function removeOrderPrefixes(filePath: string): string {
  return filePath.replace(/(^|\/)\d+\./g, '$1')
}

/** Join multiple paths together */
export function joinPaths(...paths: (string | undefined)[]): string {
  if (paths.length === 0) {
    return '.'
  }

  const isAbsolute = paths.at(0)?.startsWith('/')
  const segments: string[] = []
  const lastSegmentIndex = paths.length - 1
  let hasTrailingSlash = false

  for (let index = 0; index < paths.length; index++) {
    const path = paths[index]

    if (!path) {
      continue
    }

    if (index === lastSegmentIndex) {
      hasTrailingSlash = path.endsWith('/')
    }

    for (const segment of path.split('/')) {
      if (segment === '..') {
        if (isAbsolute || segments.length > 0) {
          segments.pop() // Go up one directory
        }
      } else if (segment && segment !== '.') {
        segments.push(segment)
      }
    }
  }

  const resolvedPath = segments.join('/')
  let finalPath = isAbsolute ? `/${resolvedPath}` : resolvedPath || '.'

  if (hasTrailingSlash && finalPath !== '/') {
    finalPath += '/'
  }

  return finalPath
}

/** Get the relative path from one file to another */
export function relativePath(from: string, to: string): string {
  const fromParts = from.split('/').filter(Boolean)
  const toParts = to.split('/').filter(Boolean)

  let commonIndex = 0
  while (
    commonIndex < fromParts.length &&
    fromParts[commonIndex] === toParts[commonIndex]
  ) {
    commonIndex++
  }

  const fromRemaining = fromParts.slice(commonIndex).map(() => '..')
  const toRemaining = toParts.slice(commonIndex)

  return [...fromRemaining, ...toRemaining].join('/')
}

/** Ensure a path is relative */
export function ensureRelativePath(path: string = '.') {
  return path.startsWith('.') ? path : `./${path}`
}
