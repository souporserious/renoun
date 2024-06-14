import { resolve, posix } from 'node:path'
import slugify from '@sindresorhus/slugify'

/** Converts a file system path to a URL-friendly pathname. */
export function filePathToPathname(
  /** The file path to convert. */
  filePath: string,

  /** The base directory to remove from the file path. */
  baseDirectory?: string,

  /** The base pathname to prepend to the file path. */
  basePathname?: string,

  /** The package name to use for index and readme paths. */
  packageName?: string
) {
  let baseFilePath: string = filePath

  // Calculate the base file path
  if (baseDirectory) {
    // Convert relative base directory paths to absolute paths
    if (baseDirectory?.startsWith('.')) {
      baseDirectory = resolve(process.cwd(), baseDirectory)
    }

    // Ensure that there is a trailing separator
    const normalizedBaseDirectory = baseDirectory.replace(/\/$|$/, posix.sep)

    // Remove the base directory from the file path
    ;[, baseFilePath] = filePath.split(normalizedBaseDirectory)
  } else {
    baseFilePath = baseFilePath.replace(process.cwd(), '')
  }

  let parsedFilePath = baseFilePath
    // Remove leading separator "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number "01."
    .replace(/\/\d+\./g, posix.sep)
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')

  const segments = parsedFilePath.split(posix.sep)

  // Remove duplicate segment if last directory name matches file name (e.g. "Button/Button.tsx")
  if (
    segments.length > 1 &&
    segments.at(-2)!.toLowerCase() === segments.at(-1)!.toLowerCase()
  ) {
    segments.pop()
  }

  // Convert camel and pascal case names to kebab case for case-insensitive paths
  parsedFilePath = segments
    .map((segment) => slugify(segment))
    .filter(Boolean)
    .join(posix.sep)

  // Prepend the base pathname if defined
  if (basePathname) {
    parsedFilePath = posix.join(basePathname, parsedFilePath)
  }

  // Ensure leading slash
  if (!parsedFilePath.startsWith(posix.sep)) {
    parsedFilePath = posix.sep + parsedFilePath
  }

  // Use directory for root index and readme
  if (parsedFilePath === '/index' || parsedFilePath === '/readme') {
    if (packageName) {
      parsedFilePath = posix.join(posix.sep, packageName)
    } else if (baseDirectory) {
      parsedFilePath = posix.join(posix.sep, baseDirectory)
    } else {
      throw new Error(
        `[mdxts] Cannot determine base path for file path "${filePath}". Provide a base directory or base path.`
      )
    }
  } else {
    // Otherwise, remove trailing "/readme" or "/index" if it exists
    parsedFilePath = parsedFilePath.replace(/\/(readme|index)$/i, '')
  }

  return parsedFilePath
}
