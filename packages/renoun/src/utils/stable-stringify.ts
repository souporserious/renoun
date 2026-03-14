export function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'NaN'
    }

    if (value === Number.POSITIVE_INFINITY) {
      return 'Infinity'
    }

    if (value === Number.NEGATIVE_INFINITY) {
      return '-Infinity'
    }
  }

  if (typeof value === 'bigint') {
    return `bigint:${value.toString()}`
  }

  if (typeof value === 'symbol') {
    return `symbol:${value.description ?? ''}`
  }

  if (typeof value === 'function') {
    return `function:${value.name || 'anonymous'}`
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    const entries: string[] = []

    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        entries.push('<hole>')
        continue
      }

      entries.push(stableStringify(value[index]))
    }

    return `[${entries.join(',')}]`
  }

  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort()
  const entries: string[] = []

  for (const key of keys) {
    entries.push(`${JSON.stringify(key)}:${stableStringify(object[key])}`)
  }

  return `{${entries.join(',')}}`
}
