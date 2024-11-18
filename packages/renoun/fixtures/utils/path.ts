export function basename(path: string, extension: string = ''): string {
  const base = path.substring(path.lastIndexOf('/') + 1)
  if (extension && base.endsWith(extension)) {
    return base.slice(0, -extension.length)
  }
  return base
}
