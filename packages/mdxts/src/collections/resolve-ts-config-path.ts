import { resolve } from 'node:path'

/**
 * Resolves a file path using the provided tsconfig paths.
 */
export function resolveTsConfigPath(
  baseUrl: string,
  paths: Record<string, string[]>,
  filePath: string
): string {
  const normalizedFilePath = filePath.replace(/\\/g, '/')

  for (const [alias, locations] of Object.entries(paths)) {
    const aliasPattern = alias.replace(/\*/g, '(.*)')
    const regex = new RegExp(`^${aliasPattern}$`)
    const match = normalizedFilePath.match(regex)

    if (match) {
      for (const location of locations) {
        const resolvedPath = location.replace(/\*/g, match[1])
        const finalPath = resolve(baseUrl, resolvedPath)
        return finalPath
      }
    }
  }

  if (baseUrl) {
    return resolve(baseUrl, filePath)
  }

  return filePath
}
