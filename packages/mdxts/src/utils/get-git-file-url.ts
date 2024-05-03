/** Constructs a URL for a specific file in a Git repository. Supports GitHub, GitLab, and Bitbucket. */
export function getGitFileUrl(
  filePath: string,
  line: number = 0,
  column: number = 0,
  gitSource: string,
  gitBranch: string = 'main'
): string {
  const url = new URL(gitSource)
  let fileUrl: string

  switch (url.hostname) {
    case 'github.com':
      fileUrl = `${gitSource}/blob/${gitBranch}/${filePath}`
      if (line || column) fileUrl += `?plain=1`
      if (line) fileUrl += `#L${line}`
      if (column) fileUrl += `:${column}`
      break

    case 'gitlab.com':
      fileUrl = `${gitSource}/-/blob/${gitBranch}/${filePath}`
      if (line) fileUrl += `#L${line}`
      break

    case 'bitbucket.org':
      fileUrl = `${gitSource}/src/${gitBranch}/${filePath}`
      if (line) fileUrl += `#lines-${line}`
      break

    default:
      throw new Error(`Git provider not recognized for ${gitSource}`)
  }

  return fileUrl
}
