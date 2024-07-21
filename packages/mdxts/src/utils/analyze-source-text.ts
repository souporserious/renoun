import type { Project } from 'ts-morph'
import { getTokens } from './get-tokens'
import type { ParseMetadataOptions } from './parse-source-text-metadata'
import { parseSourceTextMetadata } from './parse-source-text-metadata'

export type AnalyzeSourceTextOptions = ParseMetadataOptions & {
  project: Project
  sourcePath?: string
  showErrors?: boolean
}

export type AnalyzeSourceTextResult = {
  tokens: Awaited<ReturnType<typeof getTokens>>
  value: string
  label: string
}

export async function analyzeSourceText({
  project,
  filename,
  language,
  allowErrors,
  showErrors,
  sourcePath,
  ...options
}: AnalyzeSourceTextOptions): Promise<AnalyzeSourceTextResult> {
  const metadata = await parseSourceTextMetadata({
    project,
    filename,
    language,
    allowErrors,
    ...options,
  })
  const tokens = await getTokens(
    project,
    metadata.value,
    metadata.language,
    metadata.filename,
    allowErrors,
    showErrors,
    // Simplify the path for more legibile error messages.
    sourcePath ? sourcePath.split(process.cwd()).at(1) : undefined
  )

  return {
    tokens,
    value: metadata.value,
    label: metadata.filenameLabel,
  }
}
