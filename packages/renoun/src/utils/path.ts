import type * as NodeUrl from 'node:url'

import { getRootDirectory } from './get-root-directory.ts'
import { reportBestEffortError } from './best-effort.ts'
import {
  joinPaths,
  normalizeSlashes,
  trimLeadingSlashes,
} from './path-core.ts'

export type PathLike = string | URL

function getNodeUrl(): typeof NodeUrl | undefined {
  if (
    typeof process === 'undefined' ||
    typeof process.getBuiltinModule !== 'function'
  ) {
    return undefined
  }

  return (
    (process.getBuiltinModule('node:url') as typeof NodeUrl | undefined) ??
    (process.getBuiltinModule('url') as typeof NodeUrl | undefined)
  )
}

function fileUrlToPath(url: URL): string {
  const nodeUrl = getNodeUrl()

  if (nodeUrl?.fileURLToPath) {
    return nodeUrl.fileURLToPath(url)
  }

  const decodedPathname = decodeURIComponent(url.pathname)

  if (url.host) {
    return `//${url.host}${decodedPathname}`
  }

  if (/^\/[A-Za-z]:/.test(decodedPathname)) {
    return decodedPathname.slice(1)
  }

  return decodedPathname
}
export {
  baseName,
  directoryName,
  ensureRelativePath,
  extensionName,
  isAbsolutePath,
  joinPaths,
  normalizePath,
  normalizePathKey,
  normalizeSlashes,
  normalizeWorkspaceRelativePath,
  relativePath,
  removeAllExtensions,
  removeExtension,
  removeOrderPrefixes,
  trimLeadingCurrentDirPrefix,
  trimLeadingDotPrefix,
  trimLeadingDotsSegment,
  trimLeadingDotSlash,
  trimLeadingSlashes,
  trimTrailingSlashes,
} from './path-core.ts'

/** Convert a `PathLike` input into a usable file system path string. */
export function pathLikeToString(path: PathLike): string {
  if (path instanceof URL) {
    if (path.protocol === 'file:') {
      return fileUrlToPath(path)
    }

    return path.href
  }

  if (typeof path === 'string' && path.startsWith('file:')) {
    try {
      return fileUrlToPath(new URL(path))
    } catch (error) {
      reportBestEffortError('utils/path', error)
    }
  }

  return path
}

const SCHEME_RESOLVERS: Record<string, (path: string) => string> = {
  workspace: (schemePath: string) => {
    const workspaceRoot = normalizeSlashes(getRootDirectory())
    const normalizedSchemePath = trimLeadingSlashes(
      normalizeSlashes(schemePath)
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
