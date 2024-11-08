export function basename(path: string, ext: string = ''): string {
  const base = path.substring(path.lastIndexOf('/') + 1)
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length)
  }
  return base
}

export function extname(path: string): string {
  const dotIndex = path.lastIndexOf('.')
  const slashIndex = path.lastIndexOf('/')
  if (dotIndex > slashIndex) {
    return path.substring(dotIndex)
  }
  return ''
}

export function join(...paths: string[]): string {
  return paths
    .join('/')
    .replace(/\/+/g, '/') // Remove any duplicate slashes
    .replace(/\/$/, '') // Remove trailing slash if present
}
