import { getTokens } from './get-tokens.js'
import type { createHighlighter } from './create-highlighter.js'
import type { ParseMetadataOptions } from './parse-source-text-metadata.js'
import { parseSourceTextMetadata } from './parse-source-text-metadata.js'
import type { Project } from "ts-morph";

export type AnalyzeSourceTextOptions = ParseMetadataOptions & {
  project: Project
  highlighter?: Awaited<ReturnType<typeof createHighlighter>>
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
  isInline,
  highlighter,
  ...options
}: AnalyzeSourceTextOptions): Promise<AnalyzeSourceTextResult> {
  const metadata = await parseSourceTextMetadata({
    project,
    filename,
    language,
    allowErrors,
    isInline,
    ...options,
  })
  const tokens = await getTokens(
    project,
    metadata.value,
    metadata.language,
    metadata.filename,
    allowErrors,
    showErrors,
    isInline,
    highlighter,
    // Simplify the path for more legibile error messages.
    sourcePath ? sourcePath.split(process.cwd()).at(1) : undefined
  )

  return {
    tokens,
    value: metadata.value,
    label: metadata.filenameLabel,
  }
}
