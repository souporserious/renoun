export function summarizePersistedValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return `${typeof value}:${value}`
  }

  if (typeof value === 'undefined') {
    return 'undefined'
  }

  if (typeof value === 'symbol') {
    return `symbol:${value.description ?? value.toString()}`
  }

  if (value instanceof RegExp) {
    return `regexp:${value.toString()}`
  }

  if (Array.isArray(value)) {
    const length = value.length
    const first = summarizePersistedValue(value[0])
    return `array(length=${length}, first=${first})`
  }

  if (typeof value === 'function') {
    return `function:${value.name || 'anonymous'}`
  }

  if (typeof value === 'bigint') {
    return `bigint:${value.toString()}`
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    const previewKeys = keys.slice(0, 10).join(',')
    const hasSymbols = Object.getOwnPropertySymbols(value as object).length > 0
    const symbolsPart = hasSymbols ? ' symbols=true' : ''
    return `object(keys=[${previewKeys}]${symbolsPart})`
  }

  return `unsupported:${typeof value}`
}
