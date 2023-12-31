import { resolve, sep } from 'node:path'
import { kebabCase } from 'case-anything'

/** Converts a file system path to a URL-friendly pathname. */
export function filePathToPathname(
  filePath: string,
  baseDirectory?: string,
  basePathname?: string,
  packageName?: string
) {
  // Convert relative paths to absolute paths
  if (baseDirectory?.startsWith('.')) {
    baseDirectory = resolve(process.cwd(), baseDirectory)
  }

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

  const segments = parsedFilePath.split(sep)

  // Remove duplicate segment if last directory name matches file name (e.g. "Button/Button.tsx")
  if (
    segments.length > 1 &&
    segments.at(-2)!.toLowerCase() === segments.at(-1)!.toLowerCase()
  ) {
    segments.pop()
  }

  // Convert camel and pascal case names to kebab case for case-insensitive paths
  parsedFilePath = segments
    .map((segment) => {
      const isPascalCase = /^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(segment)
      const isCamelCase = /^[a-z]+(?:[A-Z][a-z]+)*$/.test(segment)
      return isPascalCase || isCamelCase ? kebabCase(segment) : segment
    })
    .filter(Boolean)
    .join(sep)

  // Use directory for root index and readme
  if (
    parsedFilePath.toLowerCase() === 'index' ||
    parsedFilePath.toLowerCase() === 'readme'
  ) {
    if (packageName) {
      return packageName
    }

    if (basePathname) {
      return basePathname
    }

    if (baseDirectory) {
      return baseDirectory
    }

    throw new Error(
      `Cannot determine base path for file path "${filePath}". Please provide a base directory or base path.`
    )
  }

  return parsedFilePath
}
