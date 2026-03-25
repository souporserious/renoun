import type {
  StructureDescriptionOption,
  StructureGitDatesOption,
  StructureOptions,
} from './types.ts'

export type NormalizedStructureDescriptions = false | 'snippet' | 'full'
export type NormalizedStructureGitDates = false | 'first' | 'last' | 'both'

export interface NormalizedStructureOptions {
  includeExports: boolean | 'headers'
  includeSections: boolean
  includeDescriptions: NormalizedStructureDescriptions
  includeGitDates: NormalizedStructureGitDates
  includeAuthors: boolean
  includeTags: boolean
  includeResolvedTypes: boolean
}

export const DEFAULT_STRUCTURE_OPTIONS: NormalizedStructureOptions = {
  includeExports: true,
  includeSections: true,
  includeDescriptions: 'full',
  includeGitDates: 'both',
  includeAuthors: false,
  includeTags: true,
  includeResolvedTypes: true,
}

function normalizeStructureDescriptions(
  includeDescriptions: StructureDescriptionOption | undefined
): NormalizedStructureDescriptions {
  if (includeDescriptions === false || includeDescriptions === 'snippet') {
    return includeDescriptions
  }

  return 'full'
}

function normalizeStructureGitDates(
  includeGitDates: StructureGitDatesOption | undefined
): NormalizedStructureGitDates {
  if (includeGitDates === false) {
    return false
  }

  if (includeGitDates === 'first' || includeGitDates === 'last') {
    return includeGitDates
  }

  return 'both'
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
  const includeDescriptions = normalizeStructureDescriptions(
    options.includeDescriptions
  )
  const includeGitDates = normalizeStructureGitDates(options.includeGitDates)
  const includeTags =
    includeExports === false ? false : options.includeTags ?? includeExports !== 'headers'

  return {
    includeExports,
    includeSections: options.includeSections ?? true,
    includeDescriptions,
    includeGitDates,
    includeAuthors: options.includeAuthors ?? false,
    includeTags,
    includeResolvedTypes,
  }
}

export function includesGitDates(
  options?: StructureOptions | NormalizedStructureOptions
): boolean {
  return normalizeStructureOptions(options).includeGitDates !== false
}

export function includesFirstCommitDate(
  options?: StructureOptions | NormalizedStructureOptions
): boolean {
  const includeGitDates = normalizeStructureOptions(options).includeGitDates
  return includeGitDates === 'first' || includeGitDates === 'both'
}

export function includesLastCommitDate(
  options?: StructureOptions | NormalizedStructureOptions
): boolean {
  const includeGitDates = normalizeStructureOptions(options).includeGitDates
  return includeGitDates === 'last' || includeGitDates === 'both'
}

export function includesAuthors(
  options?: StructureOptions | NormalizedStructureOptions
): boolean {
  return normalizeStructureOptions(options).includeAuthors
}

export function includesGitMetadata(
  options?: StructureOptions | NormalizedStructureOptions
): boolean {
  const normalized = normalizeStructureOptions(options)
  return normalized.includeAuthors || normalized.includeGitDates !== false
}

export function getStructureOptionsSignature(
  options?: StructureOptions | NormalizedStructureOptions
): string {
  const normalized =
    options &&
    'includeGitDates' in options &&
    'includeSections' in options &&
    'includeDescriptions' in options &&
    'includeAuthors' in options &&
    'includeTags' in options &&
    'includeResolvedTypes' in options &&
    'includeExports' in options
      ? options
      : normalizeStructureOptions(options)

  return [
    `exports:${normalized.includeExports}`,
    `sections:${normalized.includeSections ? '1' : '0'}`,
    `descriptions:${normalized.includeDescriptions}`,
    `git:${normalized.includeGitDates === false ? '0' : normalized.includeGitDates}`,
    `authors:${normalized.includeAuthors ? '1' : '0'}`,
    `tags:${normalized.includeTags ? '1' : '0'}`,
    `types:${normalized.includeResolvedTypes ? '1' : '0'}`,
  ].join('|')
}
