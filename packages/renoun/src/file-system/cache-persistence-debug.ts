import { createHmac, randomBytes } from 'node:crypto'

export const CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM =
  'hmac-sha256' as const
export const CACHE_PERSISTENCE_DEBUG_REDACTION_HEX_LENGTH = 64 as const

const CACHE_PERSISTENCE_DEBUG_REDACTION_KEY = randomBytes(32)

function redactStringForDebug(value: string): string {
  return createHmac('sha256', CACHE_PERSISTENCE_DEBUG_REDACTION_KEY)
    .update(value)
    .digest('hex')
}

export function summarizePersistedValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return `string(length=${value.length} ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=${redactStringForDebug(
      value
    )})`
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'number:NaN'
    }

    if (value === Number.POSITIVE_INFINITY) {
      return 'number:Infinity'
    }

    if (value === Number.NEGATIVE_INFINITY) {
      return 'number:-Infinity'
    }

    return `number(${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=${redactStringForDebug(
      String(value)
    )})`
  }

  if (typeof value === 'boolean') {
    return `boolean:${String(value)}`
  }

  if (typeof value === 'undefined') {
    return 'undefined'
  }

  if (typeof value === 'symbol') {
    const description = value.description ?? ''
    return `symbol(description-length=${description.length} ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=${redactStringForDebug(
      description
    )})`
  }

  if (value instanceof RegExp) {
    return `regexp(flags=${value.flags} source-length=${value.source.length} ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=${redactStringForDebug(
      value.source
    )})`
  }

  if (Array.isArray(value)) {
    const length = value.length
    const first = summarizePersistedValue(value[0])
    return `array(length=${length}, first=${first})`
  }

  if (typeof value === 'function') {
    const name = value.name || 'anonymous'
    return `function(name-length=${name.length} ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=${redactStringForDebug(
      name
    )})`
  }

  if (typeof value === 'bigint') {
    const serialized = value.toString()
    return `bigint(length=${serialized.length} ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=${redactStringForDebug(
      serialized
    )})`
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    const previewKeys = [...keys].sort().slice(0, 10)
    const keyPreview = previewKeys.join(',')
    const keyPreviewFingerprint = redactStringForDebug(keyPreview)
    const hasSymbols = Object.getOwnPropertySymbols(value as object).length > 0
    const symbolsPart = hasSymbols ? ' symbols=true' : ''
    return `object(key-count=${keys.length} key-preview-count=${previewKeys.length} key-preview-${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=${keyPreviewFingerprint}${symbolsPart})`
  }

  return `unsupported:${typeof value}`
}
