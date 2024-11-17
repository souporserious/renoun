/** Get the base name of a file system path e.g. /path/to/file -> file */
export function baseName(path: string, extension: string = ''): string {
  const base = path.substring(path.lastIndexOf('/') + 1)
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
    return path.substring(dotIndex)
  }
  return ''
}

/** Get the directory name from a file path e.g. /path/to/file -> /path/to */
export function directoryName(path: string): string {
  const slashIndex = path.lastIndexOf('/')
  if (slashIndex === -1) return '.'
  if (slashIndex === 0) return '/'
  return path.substring(0, slashIndex)
}

/** Remove the extension from a file path e.g. readme.md -> readme */
export function removeExtension(filePath: string): string {
  return join(
    directoryName(filePath),
    baseName(filePath, extensionName(filePath))
  )
}

/** Remove order prefixes from a file path e.g. 01.intro -> intro */
export function removeOrderPrefixes(filePath: string): string {
  return filePath.replace(/(^|\/)\d+\./g, '$1')
}

/** Join multiple paths together */
export function join(...paths: string[]): string {
  return paths
    .join('/')
    .replace(/\/+/g, '/') // Remove any duplicate slashes
    .replace(/\/$/, '') // Remove trailing slash if present
}

/** Get the relative path from one file to another */
export function relative(from: string, to: string): string {
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
