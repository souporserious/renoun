import { fileURLToPath } from 'node:url'

import { getRootDirectory } from './get-root-directory.ts'

export type PathLike = string | URL

/** Convert a `PathLike` input into a usable file system path string. */
export function pathLikeToString(path: PathLike): string {
  if (path instanceof URL) {
    if (path.protocol === 'file:') {
      return fileURLToPath(path)
    }

    return path.href
  }

  if (typeof path === 'string' && path.startsWith('file:')) {
    try {
      return fileURLToPath(new URL(path))
    } catch {
      // Ignore parsing errors and fall back to the original string.
    }
  }

  return path
}

const SCHEME_RESOLVERS: Record<string, (path: string) => string> = {
  workspace: (schemePath: string) => {
    const workspaceRoot = normalizeSlashes(getRootDirectory())
    const normalizedSchemePath = normalizeSlashes(schemePath).replace(
      /^\/+/,
      ''
    )

    if (normalizedSchemePath.length === 0) {
      return workspaceRoot
    }

    return joinPaths(workspaceRoot, normalizedSchemePath)
  },
}

/** Parse a path scheme into a scheme and rest. */
function parseSchemePath(path: string) {
  const match = /^(?<scheme>[a-zA-Z][a-zA-Z0-9+.-]*:)(?<rest>.*)$/.exec(path)

  if (!match || !match.groups) {
    return null
  }

  return {
    scheme: match.groups['scheme'].slice(0, -1),
    rest: match.groups['rest'],
  }
}

/** Normalize Windows backslashes to POSIX forward slashes. */
export function normalizeSlashes(path: string): string {
  return path.replace(/\\+/g, '/')
}

export function isAbsolutePath(path: string): boolean {
  const normalized = normalizeSlashes(path)

  return (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith('//')
  )
}

/** Remove trailing forward slashes from a path-like string. */
export function trimTrailingSlashes(value: string): string {
  let end = value.length
  // 47 is '/'
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--
  return value.slice(0, end)
}

/** Normalize a path to a stable key form (relative, no outer slashes, '.' for root). */
export function normalizePathKey(path: string): string {
  const normalized = normalizeSlashes(path)
  let start = 0
  let end = normalized.length

  if (
    end >= 2 &&
    normalized.charCodeAt(0) === 46 &&
    normalized.charCodeAt(1) === 47
  ) {
    start = 2
    while (start < end && normalized.charCodeAt(start) === 47) {
      start++
    }
  }

  while (start < end && normalized.charCodeAt(start) === 47) {
    start++
  }

  while (end > start && normalized.charCodeAt(end - 1) === 47) {
    end--
  }

  const key = normalized.slice(start, end)
  return key === '' ? '.' : key
}

/** Normalize a path to be relative to the current working directory. */
export function normalizePath(path: string): string {
  const normalizedSlashes = normalizeSlashes(path)
  // Handle current directory special case
  if (normalizedSlashes === '.') {
    return './'
  }
  // Check for actual relative paths (./ or ../) not hidden files (.gitkeep)
  const isCurrentDirectoryRelativePath = normalizedSlashes.startsWith('./')
  const isAncestorRelativePath = normalizedSlashes.startsWith('../')
  return isCurrentDirectoryRelativePath || isAncestorRelativePath
    ? normalizedSlashes
    : `./${normalizedSlashes}`
}

/** Get the base name of a file system path e.g. /path/to/file.ts -> file */
export function baseName(path: string, extension?: string): string {
  path = normalizeSlashes(path)
  const base = path.slice(path.lastIndexOf('/') + 1)
  if (extension && base.endsWith(extension)) {
    return base.slice(0, -extension.length)
  }
  return base
}

/** Get the extension from a file path e.g. readme.md -> .md */
export function extensionName(path: string): string {
  path = normalizeSlashes(path)
  const dotIndex = path.lastIndexOf('.')
  const slashIndex = path.lastIndexOf('/')
  if (dotIndex > slashIndex) {
    return path.slice(dotIndex)
  }
  return ''
}

/** Get the directory name from a file path e.g. /path/to/file.ts -> /path/to */
export function directoryName(path: string): string {
  path = normalizeSlashes(path)
  const slashIndex = path.lastIndexOf('/')
  if (slashIndex === -1) return '.'
  if (slashIndex === 0) return '/'
  return path.slice(0, slashIndex)
}

/** Remove the extension from a file path e.g. readme.md -> readme */
export function removeExtension(filePath: string): string {
  filePath = normalizeSlashes(filePath)
  const lastDotIndex = filePath.lastIndexOf('.')
  const lastSlashIndex = filePath.lastIndexOf('/')

  if (lastDotIndex > lastSlashIndex) {
    return filePath.slice(0, lastDotIndex)
  }

  return filePath
}

/** Remove all extensions from a file path e.g. Button.examples.tsx -> Button */
export function removeAllExtensions(filePath: string): string {
  filePath = normalizeSlashes(filePath)
  const lastSlashIndex = filePath.lastIndexOf('/')
  const filenNameStartOffset = 1
  const fileName = filePath.slice(lastSlashIndex + filenNameStartOffset)

  // Find the first dot that's not at position 0 (hidden files start with .)
  let firstDotIndex = fileName.indexOf('.')
  if (firstDotIndex === 0) {
    // This is a hidden file, look for the next dot
    firstDotIndex = fileName.indexOf('.', 1)
  }

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
  filePath = normalizeSlashes(filePath)
  return filePath.replace(/(^|\/)\d+\./g, '$1')
}

/** Join multiple paths together */
export function joinPaths(...paths: (string | undefined)[]): string {
  if (paths.length === 0) {
    return '.'
  }

  const isAbsolute = normalizeSlashes(paths.at(0)!).startsWith('/')
  const segments: string[] = []
  const lastSegmentIndex = paths.length - 1
  let hasTrailingSlash = false

  for (let index = 0; index < paths.length; index++) {
    const path = paths[index]

    if (!path) {
      continue
    }

    if (index === lastSegmentIndex) {
      hasTrailingSlash = path.endsWith('/') || path.endsWith('\\')
    }

    for (const segment of normalizeSlashes(path).split('/')) {
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
  const fromParts = normalizeSlashes(from).split('/').filter(Boolean)
  const toParts = normalizeSlashes(to).split('/').filter(Boolean)

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

/** Resolve a path scheme relative to the current working directory. */
export function resolveSchemePath(path: PathLike): string {
  const normalizedPath = pathLikeToString(path)
  const parsed = parseSchemePath(normalizedPath)

  if (!parsed) {
    return normalizedPath
  }

  const resolver = SCHEME_RESOLVERS[parsed.scheme]

  if (!resolver) {
    return normalizedPath
  }

  // Return an absolute path resolved from the workspace root
  return resolver(parsed.rest)
}

/** Ensure a path is relative */
export function ensureRelativePath(path: string = '.') {
  return path.startsWith('.') ? path : `./${path}`
}
