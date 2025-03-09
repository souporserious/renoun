import { waitForRefreshingProjects } from '../project/refresh.js'
import type {
  ParseMetadataOptions,
  ParseMetadataResult,
} from './parse-source-text-metadata.js'
import { parseSourceTextMetadata } from './parse-source-text-metadata.js'
import type { Project } from 'ts-morph'

export type AnalyzeSourceTextOptions = ParseMetadataOptions & {
  project: Project
}

export async function analyzeSourceText({
  project,
  filename,
  language,
  allowErrors,
  isInline,
  ...options
}: AnalyzeSourceTextOptions): Promise<ParseMetadataResult> {
  await waitForRefreshingProjects()

  return parseSourceTextMetadata({
    project,
    filename,
    language,
    allowErrors,
    isInline,
    ...options,
  })
}
