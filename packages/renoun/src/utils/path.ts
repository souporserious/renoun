import { cwd } from 'node:process'

import { getRootDirectory } from './get-root-directory.js'

const PROTOCOL_RESOLVERS: Record<string, (path: string) => string> = {
  workspace: (protocolPath: string) => {
    const workspaceRoot = normalizeSlashes(getRootDirectory())
    const normalizedProtocolPath = normalizeSlashes(protocolPath).replace(
      /^\/+/,
      ''
    )

    if (normalizedProtocolPath.length === 0) {
      return workspaceRoot
    }

    return joinPaths(workspaceRoot, normalizedProtocolPath)
  },
}

function parseProtocolPath(path: string) {
  const match = /^(?<protocol>[a-zA-Z][a-zA-Z0-9+.-]*:)(?<rest>.*)$/.exec(path)

  if (!match || !match.groups) {
    return null
  }

  return {
    protocol: match.groups['protocol'].slice(0, -1),
    rest: match.groups['rest'],
  }
}

/** Normalize Windows backslashes to POSIX forward slashes. */
export function normalizeSlashes(path: string): string {
  return path.replace(/\\+/g, '/')
}

/** Normalize a path to be relative to the current working directory. */
export function normalizePath(path: string): string {
  const normalizedSlashes = normalizeSlashes(path)
  return normalizedSlashes.startsWith('.')
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
  const firstDotIndex = fileName.lastIndexOf('.')

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

/** Resolve a protocol path relative to the current working directory. */
export function resolveProtocolPath(path: string): string {
  const parsed = parseProtocolPath(path)

  if (!parsed) {
    return path
  }

  const resolver = PROTOCOL_RESOLVERS[parsed.protocol]

  if (!resolver) {
    return path
  }

  const absolutePath = resolver(parsed.rest)
  const relativeProtocolPath = relativePath(
    normalizeSlashes(cwd()),
    normalizeSlashes(absolutePath)
  )

  return relativeProtocolPath === '' ? '.' : relativeProtocolPath
}

/** Ensure a path is relative */
export function ensureRelativePath(path: string = '.') {
  return path.startsWith('.') ? path : `./${path}`
}
