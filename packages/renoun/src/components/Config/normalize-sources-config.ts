import type { SourceDefinition, SourcesConfig } from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSourceDefinition(value: unknown): value is SourceDefinition {
  if (!isRecord(value)) return false
  return value['type'] === 'figma' && typeof value['fileId'] === 'string'
}

/**
 * The input shape for the sources configuration.
 * @internal
 */
export type SourcesConfigInput = Record<string, SourceDefinition>

/**
 * Normalizes the sources configuration.
 * @internal
 */
export function normalizeSourcesConfig(
  input: unknown,
  context = 'sources'
): SourcesConfig {
  if (input == null) {
    return {}
  }
  if (!isRecord(input)) {
    throw new Error(
      `[renoun] ${context} must be an object map of source names to definitions.`
    )
  }
  const result: SourcesConfig = {}
  for (const [name, value] of Object.entries(input)) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`[renoun] ${context} contains an invalid source name.`)
    }
    if (name === 'figma') {
      throw new Error(
        '[renoun] The "figma" source is built-in and cannot be redefined. Remove this entry.'
      )
    }
    if (!isSourceDefinition(value)) {
      throw new Error(
        `[renoun] ${context}[${JSON.stringify(
          name
        )}] must be an object like { type: 'figma', fileId: '...' }`
      )
    }
    result[name] = {
      type: 'figma',
      fileId: String((value as any).fileId).trim(),
      basePathname: (value as any).basePathname
        ? String((value as any).basePathname).trim()
        : undefined,
    }
  }
  return result
}
