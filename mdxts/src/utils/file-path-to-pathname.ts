import { resolve, sep } from 'node:path'
import { kebabCase } from 'case-anything'

/** Converts a file system path to a URL-friendly pathname. */
export function filePathToPathname(filePath: string, baseDirectory?: string) {
  const [baseDirectoryPath, baseFilePath] = baseDirectory
    ? filePath.split(baseDirectory)
    : ['', filePath]
  let parsedFilePath = baseFilePath
    // Remove leading separator "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number "01."
    .replace(/\/\d+\./g, sep)
    // Remove working directory
    .replace(
      baseDirectory
        ? resolve(process.cwd(), baseDirectoryPath, sep)
        : process.cwd(),
      ''
    )
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove trailing "/readme" or "/index"
    .replace(/\/(readme|index)$/i, '')

  // Convert component names to kebab case for case-insensitive paths
  return parsedFilePath
    .split(sep)
    .map((segment) => (/[A-Z]/.test(segment[0]) ? kebabCase(segment) : segment))
    .filter(Boolean)
    .join(sep)
}
