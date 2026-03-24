import type { StructureOptions } from './types.ts'

export interface NormalizedStructureOptions {
  includeExports: boolean | 'headers'
  includeSections: boolean
  includeGitDates: boolean
  includeResolvedTypes: boolean
}

export const DEFAULT_STRUCTURE_OPTIONS: NormalizedStructureOptions = {
  includeExports: true,
  includeSections: true,
  includeGitDates: true,
  includeResolvedTypes: true,
}

export function normalizeStructureOptions(
  options?: StructureOptions
): NormalizedStructureOptions {
  if (!options) {
    return DEFAULT_STRUCTURE_OPTIONS
  }

  const includeExports = options.includeExports ?? true
  const includeResolvedTypes =
    includeExports === true ? options.includeResolvedTypes ?? true : false

  return {
    includeExports,
    includeSections: options.includeSections ?? true,
    includeGitDates: options.includeGitDates ?? true,
    includeResolvedTypes,
  }
}

export function getStructureOptionsSignature(
  options?: StructureOptions | NormalizedStructureOptions
): string {
  const normalized =
    options &&
    'includeGitDates' in options &&
    'includeSections' in options &&
    'includeResolvedTypes' in options &&
    'includeExports' in options
      ? options
      : normalizeStructureOptions(options)

  return [
    `exports:${normalized.includeExports}`,
    `sections:${normalized.includeSections ? '1' : '0'}`,
    `git:${normalized.includeGitDates ? '1' : '0'}`,
    `types:${normalized.includeResolvedTypes ? '1' : '0'}`,
  ].join('|')
}
