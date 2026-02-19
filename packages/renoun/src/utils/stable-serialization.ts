import { createHash } from 'node:crypto'

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort()
  const entries: string[] = []

  for (const key of keys) {
    entries.push(`${JSON.stringify(key)}:${stableStringify(object[key])}`)
  }

  return `{${entries.join(',')}}`
}

export function hashString(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}
