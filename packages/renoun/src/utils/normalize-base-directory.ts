import { pathLikeToString, resolveSchemePath, type PathLike } from './path.ts'

export function normalizeBaseDirectory(
  baseDirectory?: PathLike
): string | undefined {
  if (baseDirectory === undefined) return baseDirectory

  let directoryUrl: URL | undefined

  if (baseDirectory instanceof URL) {
    const shouldResolveToParent =
      baseDirectory.protocol === 'file:' ||
      !baseDirectory.pathname.endsWith('/')
    directoryUrl = shouldResolveToParent
      ? new URL('.', baseDirectory)
      : baseDirectory
  } else if (typeof baseDirectory === 'string') {
    if (baseDirectory.startsWith('file:')) {
      try {
        directoryUrl = new URL('.', baseDirectory)
      } catch {
        directoryUrl = undefined
      }
    } else if (URL.canParse(baseDirectory)) {
      try {
        directoryUrl = new URL('.', baseDirectory)
      } catch {
        directoryUrl = undefined
      }
    }
  }

  if (directoryUrl) {
    const directoryString =
      directoryUrl.protocol === 'file:'
        ? pathLikeToString(directoryUrl)
        : directoryUrl.href
    const resolvedDirectory = resolveSchemePath(directoryString)

    if (resolvedDirectory.endsWith('/') && resolvedDirectory !== '/') {
      return resolvedDirectory.slice(0, -1)
    }

    return resolvedDirectory
  }

  const normalizedBaseDirectory = pathLikeToString(baseDirectory)

  if (!normalizedBaseDirectory) return normalizedBaseDirectory

  return resolveSchemePath(normalizedBaseDirectory)
}
