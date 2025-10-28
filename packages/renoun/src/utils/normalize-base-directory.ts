export function normalizeBaseDirectory(
  baseDirectory?: string
): string | undefined {
  if (!baseDirectory) return baseDirectory

  try {
    if (URL.canParse(baseDirectory)) {
      const { pathname } = new URL(baseDirectory)
      // Convert file URL to its directory path (drop the filename)
      return pathname.slice(0, pathname.lastIndexOf('/'))
    }
  } catch {
    // Fall through and return the original value on parse errors
  }

  return baseDirectory
}
