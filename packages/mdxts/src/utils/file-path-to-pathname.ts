import { join, resolve, posix } from 'node:path'
import slugify from '@sindresorhus/slugify'

/** Converts a file system path to a URL-friendly pathname. */
export function filePathToPathname(
  filePath: string,
  baseDirectory?: string,
  basePathname?: string,
  packageName?: string
) {
  // Creates a path from a file path accounting for the base pathname if defined.
  function createPathame(filePath: string) {
    return basePathname
      ? basePathname === filePath
        ? join(posix.sep, basePathname)
        : join(posix.sep, basePathname, filePath)
      : join(posix.sep, filePath)
  }

  // Convert relative paths to absolute paths
  if (baseDirectory?.startsWith('.')) {
    baseDirectory = resolve(process.cwd(), baseDirectory)
  }

  // if baseDirectory is defined, ensure that there is a trailing slash
  let [baseDirectoryPath, baseFilePath] = baseDirectory
    ? filePath.split(baseDirectory.replace(/\/$|$/, '/'))
    : ['', filePath]

  if (baseFilePath === undefined) {
    throw new Error(
      `Cannot determine base path for file path "${filePath}" at base directory "${baseDirectory}".`
    )
  }

  // ensure that there is a leading slash
  baseFilePath = createPathame(baseFilePath)

  let parsedFilePath = baseFilePath
    // Remove leading separator "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number "01."
    .replace(/\/\d+\./g, posix.sep)
    // Remove working directory
    .replace(
      baseDirectory
        ? resolve(process.cwd(), baseDirectoryPath, posix.sep)
        : process.cwd(),
      ''
    )
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove trailing "/readme" or "/index"
    .replace(/\/(readme|index)$/i, '')

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

  // Use directory for root index and readme
  if (
    parsedFilePath.toLowerCase() === 'index' ||
    parsedFilePath.toLowerCase() === 'readme'
  ) {
    if (packageName) {
      return createPathame(packageName)
    }

    if (basePathname) {
      return createPathame(basePathname)
    }

    if (baseDirectory) {
      return createPathame(baseDirectory)
    }

    throw new Error(
      `Cannot determine base path for file path "${filePath}". Please provide a base directory or base path.`
    )
  }

  return createPathame(parsedFilePath)
}
