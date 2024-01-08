/** Constructs a URL for a specific file in a Git repository. Supports GitHub, GitLab, and Bitbucket. */
export function getGitFileUrl(
  filePath: string,
  line?: number,
  column?: number
): string {
  const normalizedUrl = process.env.MDXTS_GIT_SOURCE!
  const branch = process.env.MDXTS_GIT_BRANCH!
  const url = new URL(normalizedUrl)
  let fileUrl: string

  switch (url.hostname) {
    case 'github.com':
      fileUrl = `${normalizedUrl}/blob/${branch}/${filePath}`
      if (line) fileUrl += `#L${line}`
      if (column) fileUrl += `:${column}`
      break

    case 'gitlab.com':
      fileUrl = `${normalizedUrl}/-/blob/${branch}/${filePath}`
      if (line) fileUrl += `#L${line}`
      break

    case 'bitbucket.org':
      fileUrl = `${normalizedUrl}/src/${branch}/${filePath}`
      if (line) fileUrl += `#lines-${line}`
      break

    default:
      throw new Error(`Git provider not recognized for ${normalizedUrl}`)
  }

  return fileUrl
}
