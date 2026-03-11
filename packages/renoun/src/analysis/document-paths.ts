const VIRTUAL_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN =
  /\.__renoun_snippet_[A-Za-z0-9_-]+(?=(\.[^./\\]+)?$)/

export function getAnalysisDocumentStableFilePathFromVirtualFilePath(
  filePath: string
): string | undefined {
  const stableFilePath = filePath.replace(
    VIRTUAL_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN,
    ''
  )

  return stableFilePath === filePath ? undefined : stableFilePath
}
