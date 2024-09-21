import { resolve, posix } from 'node:path'

import { createSlug } from './create-slug.js'

/** Converts a file system path to a URL-friendly pathname. */
export function filePathToPathname(
  /** The file path to convert. */
  filePath: string,

  /** The base directory to remove from the file path. */
  baseDirectory?: string,

  /** The base pathname to prepend to the file path. */
  basePathname?: string,

  /** The package name to use for index and readme paths. */
  packageName?: string,

  /** Whether or not to convert the pathname to kebab case. */
  kebabCase = true
) {
  if (filePath.includes('node_modules')) {
    return ''
  }

  // First, normalize the file path
  let baseFilePath: string = filePath
    // Remove leading sorting number "01."
    .replace(/\/\d+\./g, posix.sep)
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')

  // Calculate the base file path
  if (baseDirectory) {
    // Convert relative base directory paths to absolute paths
    if (baseDirectory?.startsWith('.')) {
      baseDirectory = resolve(process.cwd(), baseDirectory)
    }

    // Ensure that there is a trailing separator
    const normalizedFilePath = baseFilePath.replace(/\/$|$/, posix.sep)
    const normalizedBaseDirectory = baseDirectory.replace(/\/$|$/, posix.sep)

    // Remove the base directory from the file path
    ;[, baseFilePath] = normalizedFilePath.split(normalizedBaseDirectory)

    // Default to an empty string if the base directory is not found
    if (!baseFilePath) {
      baseFilePath = ''
    }
  } else {
    baseFilePath = baseFilePath.replace(process.cwd(), '')
  }

  let segments = baseFilePath.split(posix.sep).filter(Boolean)

  // Extract the segment member if present
  // filename: "Button/Button.examples.tsx" -> "examples"
  // directory: "Button/examples.tsx" -> "examples"
  // sub-directory: "Button/examples/Basic.tsx" -> "examples"
  const lastSegment = segments.pop()
  if (lastSegment?.includes('.')) {
    const [baseName, member] = lastSegment.split('.')
    segments.push(baseName, member)
  } else if (lastSegment) {
    segments.push(lastSegment)
  }

  // Remove consecutive duplicate segments (e.g. "Button/Button.tsx")
  if (segments.length > 1) {
    segments = segments.reduce((result, segment) => {
      if (result.at(-1) !== segment) {
        result.push(segment)
      }
      return result
    }, [] as string[])
  }

  // Prepend the base pathname if defined
  if (basePathname) {
    segments.unshift(basePathname)
  }

  const baseIndex = segments.findIndex(
    (segment) => segment === basePathname || segment === baseDirectory
  )
  const filteredSegments = segments
    .slice(baseIndex + 1)
    .map((segment) => segment.toLowerCase())

  // Trim index and readme from the end of the path
  const baseSegment = segments.at(-1)?.toLowerCase()

  if (baseSegment === 'index' || baseSegment === 'readme') {
    segments = segments.slice(0, -1)
  }

  // Use directory for root index and readme
  if (
    filteredSegments.length === 1 &&
    (filteredSegments.includes('index') || filteredSegments.includes('readme'))
  ) {
    if (packageName) {
      segments = segments.concat(packageName)
    } else if (basePathname) {
      segments =
        segments.at(-1) === basePathname
          ? segments
          : segments.concat(basePathname)
    } else if (baseDirectory) {
      segments = segments.concat(baseDirectory)
    } else {
      throw new Error(
        `[renoun] Cannot determine base path for file path "${filePath}". Provide a base directory or base path.`
      )
    }
  }

  // Convert camel and pascal case names to kebab case for case-insensitive paths
  // e.g. "ButtonGroup" -> "button-group"
  if (kebabCase) {
    segments = segments.map(createSlug).filter(Boolean)
  }

  return posix.join(posix.sep, ...segments)
}
