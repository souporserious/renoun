import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { normalizeBaseDirectory } from './normalize-base-directory.js'

/** Reads the code from a file path. */
export async function readCodeFromPath(
  path: string,
  baseDirectory?: string
): Promise<string> {
  const normalizedBase = normalizeBaseDirectory(baseDirectory)
  const resolvedPath = normalizedBase
    ? resolve(normalizedBase, path)
    : resolve(path)

  try {
    return await readFile(resolvedPath, 'utf-8')
  } catch (error) {
    const baseDirectoryMessage = baseDirectory
      ? ` with base directory "${baseDirectory}"`
      : ''
    throw new Error(
      `[renoun] Error reading CodeBlock source at path "${path}"${baseDirectoryMessage}`,
      error instanceof Error ? { cause: error } : undefined
    )
  }
}
