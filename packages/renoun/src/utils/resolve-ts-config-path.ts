import { resolve } from 'node:path'

/**
 * Resolves a file path using the provided tsconfig paths.
 */
export function resolveTsConfigPath(
  baseDirectory: string,
  baseUrl: string,
  paths: Record<string, string[]>,
  filePattern: string
): string {
  const normalizedFilePath = filePattern.replace(/\\/g, '/')

  for (const [alias, locations] of Object.entries(paths)) {
    const aliasPattern = alias.replace(/\*/g, '(.*)')
    const regex = new RegExp(`^${aliasPattern}$`)
    const match = normalizedFilePath.match(regex)

    if (match) {
      for (const location of locations) {
        const resolvedPath = resolve(
          baseDirectory,
          baseUrl,
          location.replace(/\*/g, match[1])
        )
        return resolvedPath
      }
    }
  }

  if (baseUrl) {
    return resolve(baseDirectory, baseUrl, filePattern)
  }

  return resolve(baseDirectory, filePattern)
}
