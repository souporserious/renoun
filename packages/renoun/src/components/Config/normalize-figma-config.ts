import type { FigmaFileMap, NormalizedFigmaConfig } from './types.js'

/**
 * The input type for the Figma configuration.
 * @internal
 */
export type FigmaConfigInput = NormalizedFigmaConfig | FigmaFileMap | string

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasFilesObject(
  value: unknown
): value is { files: Record<string, unknown>; defaultFile?: string } {
  return isRecord(value) && isRecord((value as any).files)
}

function normalizeFileMap(
  map: Record<string, unknown>,
  context: string
): FigmaFileMap {
  const entries = Object.entries(map)
  if (entries.length === 0) {
    throw new Error(`[renoun] ${context} must define at least one Figma file.`)
  }

  const normalized: FigmaFileMap = {}
  for (const [alias, value] of entries) {
    if (typeof alias !== 'string' || alias.trim() === '') {
      throw new Error(`[renoun] ${context} contains an invalid file alias.`)
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `[renoun] ${context}[${JSON.stringify(alias)}] must be a non-empty string.`
      )
    }
    normalized[alias] = value
  }

  return normalized
}

/**
 * Normalize the Figma configuration.
 * @internal
 */
export function normalizeFigmaConfig(
  input: FigmaConfigInput
): NormalizedFigmaConfig {
  if (typeof input === 'string') {
    const fileId = input.trim()
    if (!fileId) {
      throw new Error(
        '[renoun] figma configuration must provide a non-empty file id.'
      )
    }
    return { files: { default: fileId }, defaultFile: 'default' }
  }

  if (!isRecord(input)) {
    throw new Error('[renoun] Invalid figma configuration. Expected an object.')
  }

  if (hasFilesObject(input)) {
    const filesProperty = input.files
    if (!isRecord(filesProperty)) {
      throw new Error(
        '[renoun] figma.files must be an object that maps aliases to file ids.'
      )
    }

    const files = normalizeFileMap(filesProperty, 'figma.files')
    const aliases = Object.keys(files)
    const defaultFile = input.defaultFile

    if (defaultFile !== undefined) {
      if (!files[defaultFile]) {
        throw new Error(
          `[renoun] figma.defaultFile ${JSON.stringify(
            defaultFile
          )} does not match any configured alias.`
        )
      }
      return { files, defaultFile }
    }

    return {
      files,
      defaultFile: aliases.length === 1 ? aliases[0] : undefined,
    }
  }

  const files = normalizeFileMap(input, 'figma')
  const aliases = Object.keys(files)

  return {
    files,
    defaultFile: aliases.length === 1 ? aliases[0] : undefined,
  }
}
