export function createWorkspaceCacheKey(absoluteRootPath: string): string {
  return JSON.stringify([absoluteRootPath])
}

export function createWorkspaceChangedPathsCacheKey(
  rootPath: string,
  previousToken: string
): string {
  return JSON.stringify([rootPath, previousToken])
}
