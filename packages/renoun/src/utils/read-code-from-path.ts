import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { normalizeBaseDirectory } from './normalize-base-directory.js'
import { pathLikeToString, type PathLike } from './path.js'

/** Reads the code from a file path. */
export async function readCodeFromPath(
  path: PathLike,
  baseDirectory?: PathLike
): Promise<string> {
  const normalizedBase = normalizeBaseDirectory(baseDirectory)
  const normalizedPath = pathLikeToString(path)
  const resolvedPath = normalizedBase
    ? resolve(normalizedBase, normalizedPath)
    : resolve(normalizedPath)

  try {
    return await readFile(resolvedPath, 'utf-8')
  } catch (error) {
    const originalBaseDirectory = baseDirectory
      ? pathLikeToString(baseDirectory)
      : undefined
    const baseDirectoryMessage = baseDirectory
      ? ` with base directory "${originalBaseDirectory}"`
      : ''
    throw new Error(
      `[renoun] Error reading CodeBlock source at path "${normalizedPath}"${baseDirectoryMessage}`,
      error instanceof Error ? { cause: error } : undefined
    )
  }
}
