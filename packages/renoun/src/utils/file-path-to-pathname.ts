import { posix, join } from 'node:path'

import { createSlug } from './create-slug.js'

/** Converts a file system path to a URL-friendly pathname. */
export function filePathToPathname(
  /** The file path to convert. */
  filePath: string,

  /** The absolute base directory to remove from the file path. */
  baseDirectory?: string,

  /** The base pathname to prepend to the file path. */
  basePathname?: string,

  /** Whether or not to convert the pathname to kebab case. */
  kebabCase = true
) {
  if (filePath.includes('node_modules')) {
    return ''
  }

  if (baseDirectory && !filePath.startsWith(baseDirectory)) {
    throw new Error(
      `The base directory "${baseDirectory}" is not formatted correctly. It must be a parent directory path of the file path "${filePath}".`
    )
  }

  const baseFilePath = baseDirectory
    ? filePath.replace(baseDirectory, '')
    : filePath

  // Split the remaining file path into segments
  let segments = baseFilePath
    .split(posix.sep)
    .map((segment) =>
      segment
        // Remove leading sorting number "01."
        .replace(/^\d+\./, '')
        // Remove file extension
        .replace(/\.[a-z]+$/, '')
    )
    .filter(Boolean)

  // Extract the segment member if present
  // e.g. "Button/Button.examples.tsx" -> "examples"
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

  // Convert camel and pascal case names to kebab case for case-insensitive paths
  // e.g. "ButtonGroup" -> "button-group"
  if (kebabCase) {
    segments = segments.map(createSlug).filter(Boolean)
  }

  return posix.join(posix.sep, ...segments)
}
