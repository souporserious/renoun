const VIRTUAL_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN =
  /\.__renoun_snippet_[A-Za-z0-9_-]+(?=(\.[^./\\]+)?$)/
const GENERATED_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN =
  /(?:^|[\\/])_renoun(?:[\\/]|$)/

export function getAnalysisDocumentStableFilePathFromVirtualFilePath(
  filePath: string
): string | undefined {
  const stableFilePath = filePath.replace(
    VIRTUAL_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN,
    ''
  )

  return stableFilePath === filePath ? undefined : stableFilePath
}

export function isSyntheticAnalysisDocumentFilePath(filePath: string): boolean {
  return (
    VIRTUAL_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN.test(filePath) ||
    GENERATED_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN.test(filePath)
  )
}
