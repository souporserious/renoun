const KNOWN_SCHEMA_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'md',
  'mdx',
  'json',
])

export type GlobModuleMap<Types = any> = Partial<
  Record<string, () => Promise<Types>>
>

export function isRuntimeLoader(
  loader: unknown
): loader is (path: string, file: unknown) => unknown {
  return typeof loader === 'function' && (loader as Function).length > 0
}

export function isGlobModuleMap(value: unknown): value is GlobModuleMap<any> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) {
    return false
  }

  // Disambiguate from extension-to-loader maps like `{ mdx: (path) => import(...) }`.
  // Glob maps use file-like keys (usually starting with `./`, `../`, `/`, or containing `/`).
  if (keys.every((key) => KNOWN_SCHEMA_EXTENSIONS.has(key))) {
    return false
  }

  const looksLikeFilePathKey = (key: string) =>
    key.startsWith('./') ||
    key.startsWith('../') ||
    key.startsWith('/') ||
    key.includes('/') ||
    key.includes('\\')

  if (!keys.some(looksLikeFilePathKey)) {
    return false
  }

  // Vite glob values are typically `() => Promise<Module>`.
  return keys.every((key) => {
    const entry = record[key]
    return typeof entry === 'function' && (entry as Function).length === 0
  })
}

/** Unwraps a loader result that may be a value, a promise, or a lazy factory. */
export async function unwrapModuleResult<T>(result: unknown): Promise<T> {
  let value: any = result

  if (typeof value === 'function') {
    value = (value as () => any)()
  }

  if (value && typeof value.then === 'function') {
    value = await value
  }

  if (typeof value === 'function') {
    value = await (value as () => any)()
  }

  return value as T
}
