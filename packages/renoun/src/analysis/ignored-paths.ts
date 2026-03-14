const IGNORED_ANALYSIS_PATH_SEGMENTS = new Set([
  '.next',
  '.renoun',
  '.git',
  'node_modules',
  'out',
  'dist',
  'build',
  'coverage',
])

export function shouldIgnoreAnalysisPath(filePath: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return true
  }

  const pathSegments = filePath.split(/[/\\]+/)
  for (const pathSegment of pathSegments) {
    if (IGNORED_ANALYSIS_PATH_SEGMENTS.has(pathSegment)) {
      return true
    }
  }

  return false
}
