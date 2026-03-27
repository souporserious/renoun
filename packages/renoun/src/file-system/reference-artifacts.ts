import type { SlugCasing } from '@renoun/mdx'
import { createSlug } from '@renoun/mdx/utils'

import {
  isPositionWithinOutlineRange,
  type OutlineRange,
} from '../utils/get-outline-ranges.ts'
import type { ModuleExport } from '../utils/get-file-exports.ts'
import type { Kind } from '../utils/resolve-type.ts'
import type {
  ExportHistoryGenerator,
  ExportHistoryReport,
  ExportChange,
  GitExportMetadata,
  GitMetadata,
  GitModuleMetadata,
  Section,
} from './types.ts'

export interface JavaScriptFileReferenceBaseData {
  exportMetadata: ModuleExport[]
  gitMetadataByName: Record<string, GitExportMetadata>
  fileGitMetadata: GitMetadata
}

export interface JavaScriptFileResolvedTypesData {
  resolvedTypes: Kind[]
  typeDependencies: string[]
}

export interface JavaScriptFileReferenceData
  extends JavaScriptFileReferenceBaseData,
    JavaScriptFileResolvedTypesData {}

export type PersistedGitAuthorMetadata = {
  name: string
  githubProfileUrl?: string
  commitCount: number
  firstCommitDate?: string
  lastCommitDate?: string
}

export type PersistedGitMetadata = {
  authors: PersistedGitAuthorMetadata[]
  firstCommitDate?: string
  lastCommitDate?: string
}

export type PersistedGitExportMetadata = {
  firstCommitDate?: string
  lastCommitDate?: string
  firstCommitHash?: string
  lastCommitHash?: string
}

export type PersistedGitExportMetadataByName = Record<
  string,
  PersistedGitExportMetadata
>

export interface PersistedJavaScriptFileReferenceBaseData {
  exportMetadata: ModuleExport[]
  gitMetadataByName: PersistedGitExportMetadataByName
  fileGitMetadata: PersistedGitMetadata
}

export interface PersistedJavaScriptFileResolvedTypesData {
  resolvedTypes: Kind[]
  typeDependencies: string[]
}

export function createEmptyGitMetadata(): GitMetadata {
  return {
    authors: [],
    firstCommitDate: undefined,
    lastCommitDate: undefined,
  }
}

export function createEmptyGitExportMetadata(): GitExportMetadata {
  return {
    firstCommitDate: undefined,
    lastCommitDate: undefined,
  }
}

export function toGitMetadataDateValue(value?: Date): string | undefined {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString()
    : undefined
}

export function toGitMetadataDate(value?: string | Date): Date | undefined {
  if (!value) {
    return undefined
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : new Date(value)
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function serializeGitMetadataForCache(
  metadata: GitMetadata
): PersistedGitMetadata {
  return {
    authors: metadata.authors.map((author) => ({
      name: author.name,
      githubProfileUrl: author.githubProfileUrl,
      commitCount: author.commitCount,
      firstCommitDate: toGitMetadataDateValue(author.firstCommitDate),
      lastCommitDate: toGitMetadataDateValue(author.lastCommitDate),
    })),
    firstCommitDate: toGitMetadataDateValue(metadata.firstCommitDate),
    lastCommitDate: toGitMetadataDateValue(metadata.lastCommitDate),
  }
}

export function deserializeGitMetadataFromCache(
  metadata: PersistedGitMetadata
): GitMetadata {
  return {
    authors: metadata.authors.map((author) => ({
      ...author,
      firstCommitDate: toGitMetadataDate(author.firstCommitDate),
      lastCommitDate: toGitMetadataDate(author.lastCommitDate),
    })),
    firstCommitDate: toGitMetadataDate(metadata.firstCommitDate),
    lastCommitDate: toGitMetadataDate(metadata.lastCommitDate),
  }
}

export function serializeGitExportMetadataForCache(
  metadata: GitExportMetadata
): PersistedGitExportMetadata {
  return {
    firstCommitDate: toGitMetadataDateValue(metadata.firstCommitDate),
    lastCommitDate: toGitMetadataDateValue(metadata.lastCommitDate),
    firstCommitHash: metadata.firstCommitHash,
    lastCommitHash: metadata.lastCommitHash,
  }
}

export function deserializeGitExportMetadataFromCache(
  metadata: PersistedGitExportMetadata | undefined
): GitExportMetadata {
  if (!metadata) {
    return createEmptyGitExportMetadata()
  }

  return {
    firstCommitDate: toGitMetadataDate(metadata.firstCommitDate),
    lastCommitDate: toGitMetadataDate(metadata.lastCommitDate),
    firstCommitHash: metadata.firstCommitHash,
    lastCommitHash: metadata.lastCommitHash,
  }
}

export function serializeGitExportMetadataRecordForCache(
  metadataByName: Record<string, GitExportMetadata>
): PersistedGitExportMetadataByName {
  const serialized: PersistedGitExportMetadataByName = Object.create(null)

  for (const [name, metadata] of Object.entries(metadataByName)) {
    serialized[name] = serializeGitExportMetadataForCache(metadata)
  }

  return serialized
}

export function deserializeGitExportMetadataRecordFromCache(
  metadataByName: PersistedGitExportMetadataByName | null | undefined
): Record<string, GitExportMetadata> {
  const deserialized: Record<string, GitExportMetadata> = Object.create(null)

  if (!metadataByName) {
    return deserialized
  }

  for (const [name, metadata] of Object.entries(metadataByName)) {
    deserialized[name] = deserializeGitExportMetadataFromCache(metadata)
  }

  return deserialized
}

export function createGitMetadataFromModuleMetadata(
  metadata: Pick<GitModuleMetadata, 'authors' | 'firstCommitDate' | 'lastCommitDate'>
): GitMetadata {
  return {
    authors: metadata.authors.map((author) => ({
      ...author,
      firstCommitDate:
        author.firstCommitDate instanceof Date
          ? new Date(author.firstCommitDate)
          : undefined,
      lastCommitDate:
        author.lastCommitDate instanceof Date
          ? new Date(author.lastCommitDate)
          : undefined,
    })),
    firstCommitDate: toGitMetadataDate(metadata.firstCommitDate),
    lastCommitDate: toGitMetadataDate(metadata.lastCommitDate),
  }
}

export function serializeJavaScriptFileReferenceBaseDataForCache(
  referenceData: JavaScriptFileReferenceBaseData
): PersistedJavaScriptFileReferenceBaseData {
  return {
    exportMetadata: referenceData.exportMetadata,
    gitMetadataByName: serializeGitExportMetadataRecordForCache(
      referenceData.gitMetadataByName
    ),
    fileGitMetadata: serializeGitMetadataForCache(referenceData.fileGitMetadata),
  }
}

export function deserializeJavaScriptFileReferenceBaseDataFromCache(
  referenceData: PersistedJavaScriptFileReferenceBaseData
): JavaScriptFileReferenceBaseData {
  return {
    exportMetadata: referenceData.exportMetadata,
    gitMetadataByName: deserializeGitExportMetadataRecordFromCache(
      referenceData.gitMetadataByName
    ),
    fileGitMetadata: deserializeGitMetadataFromCache(
      referenceData.fileGitMetadata
    ),
  }
}

export function serializeJavaScriptFileResolvedTypesDataForCache(
  resolvedTypesData: JavaScriptFileResolvedTypesData
): PersistedJavaScriptFileResolvedTypesData {
  return {
    resolvedTypes: resolvedTypesData.resolvedTypes,
    typeDependencies: resolvedTypesData.typeDependencies,
  }
}

export function deserializeJavaScriptFileResolvedTypesDataFromCache(
  resolvedTypesData: PersistedJavaScriptFileResolvedTypesData
): JavaScriptFileResolvedTypesData {
  return {
    resolvedTypes: resolvedTypesData.resolvedTypes,
    typeDependencies: resolvedTypesData.typeDependencies,
  }
}

function isPublicExport(moduleExport: ModuleExport): boolean {
  const tags = moduleExport.metadata?.jsDocMetadata?.tags

  if (!tags || tags.length === 0) {
    return true
  }

  for (const tag of tags) {
    if (!tag || tag.name !== 'internal') {
      return true
    }
  }

  return false
}

export function filterReferenceExportMetadata(
  fileExports: readonly ModuleExport[],
  stripInternal: boolean
): ModuleExport[] {
  if (!stripInternal) {
    return Array.from(fileExports)
  }

  return fileExports.filter(isPublicExport)
}

export async function drainExportHistoryGenerator(
  generator: ExportHistoryGenerator
): Promise<ExportHistoryReport> {
  let result = await generator.next()

  while (!result.done) {
    result = await generator.next()
  }

  return result.value
}

function createGitExportMetadataFromHistoryChanges(
  name: string,
  changes: ExportChange[]
): GitExportMetadata | undefined {
  let firstMatching: ExportChange | undefined
  let lastMatching: ExportChange | undefined
  let firstAny: ExportChange | undefined
  let lastAny: ExportChange | undefined

  for (const change of changes) {
    if (!firstAny || change.unix < firstAny.unix) {
      firstAny = change
    }
    if (!lastAny || change.unix > lastAny.unix) {
      lastAny = change
    }

    if (change.name !== name) {
      continue
    }

    if (!firstMatching || change.unix < firstMatching.unix) {
      firstMatching = change
    }

    if (!lastMatching || change.unix > lastMatching.unix) {
      lastMatching = change
    }
  }

  const firstChange = firstMatching ?? firstAny
  const lastChange = lastMatching ?? lastAny

  if (!firstChange && !lastChange) {
    return undefined
  }

  return {
    firstCommitDate: firstChange ? new Date(firstChange.date) : undefined,
    lastCommitDate: lastChange ? new Date(lastChange.date) : undefined,
    firstCommitHash: firstChange?.sha,
    lastCommitHash: lastChange?.sha,
  }
}

export function createGitExportMetadataRecordFromHistoryReport(
  report: ExportHistoryReport
): Record<string, GitExportMetadata> {
  const metadataByName: Record<string, GitExportMetadata> = Object.create(null)

  for (const [name, ids] of Object.entries(report.nameToId)) {
    const changes: ExportChange[] = []

    for (const id of ids) {
      const exportChanges = report.exports[id]

      if (exportChanges && exportChanges.length > 0) {
        changes.push(...exportChanges)
      }
    }

    const metadata = createGitExportMetadataFromHistoryChanges(name, changes)

    if (metadata) {
      metadataByName[name] = metadata
    }
  }

  return metadataByName
}

function getModuleExportStartLine(
  moduleExport: ModuleExport
): number | undefined {
  return (
    moduleExport.metadata?.location.position.start.line ??
    moduleExport.declarationPosition?.start.line
  )
}

export function buildJavaScriptFileSections(options: {
  outlineRanges: OutlineRange[]
  exportMetadata: readonly ModuleExport[]
  slugCasing: SlugCasing
}): Section[] {
  const regions = options.outlineRanges.filter((range) => range.kind === 'region')
  const sections: Array<{
    section: Section
    line: number
  }> = []
  const regionExportNames = new Map<OutlineRange, string[]>()

  for (const region of regions) {
    regionExportNames.set(region, [])
  }

  const ungroupedExports: Array<{
    exportName: string
    line: number
  }> = []

  const findRegionForLine = (line: number) =>
    regions.find((region) =>
      isPositionWithinOutlineRange(region, { line, column: 1 })
    )

  for (const fileExport of options.exportMetadata) {
    const startLine = getModuleExportStartLine(fileExport)
    const region =
      startLine !== undefined ? findRegionForLine(startLine) : undefined

    if (region) {
      const names = regionExportNames.get(region)
      if (names) {
        names.push(fileExport.name)
      }
    } else {
      ungroupedExports.push({
        exportName: fileExport.name,
        line: startLine ?? Number.POSITIVE_INFINITY,
      })
    }
  }

  for (const region of regions) {
    const exportNames = regionExportNames.get(region) ?? []
    const title = region.bannerText
    sections.push({
      section: {
        id: createSlug(title, options.slugCasing),
        title,
        children: exportNames.map((name) => ({
          id: name,
          title: name,
        })),
      },
      line: region.position.start.line,
    })
  }

  for (const { exportName, line } of ungroupedExports) {
    sections.push({
      section: {
        id: exportName,
        title: exportName,
      },
      line,
    })
  }

  sections.sort((left, right) => left.line - right.line)
  return sections.map(({ section }) => section)
}
