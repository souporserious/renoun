import { join } from 'path'

/** Constructs a URL for a specific file in a Git repository. Supports GitHub, GitLab, and Bitbucket. */
export function getGitFileUrl(
  filePath: string,
  line: number = 0,
  column: number = 0,
  gitSource: string,
  gitBranch: string = 'main',
  gitProvider?: string
): string {
  const url = new URL(gitSource)
  let fileUrl: string

  const provider =
    gitProvider || gitSource.replace(/^https?:\/\/(?:.*\.)?(.*?)\..*/gm, `$1`)

  switch (provider) {
    case 'github':
      fileUrl = join(url.pathname, '/blob/', gitBranch, filePath)
      if (line || column) fileUrl += `?plain=1`
      if (line) fileUrl += `#L${line}`
      if (column) fileUrl += `:${column}`
      break

    case 'gitlab':
      fileUrl = join(url.pathname, '/-/blob/', gitBranch, filePath)
      if (line) fileUrl += `#L${line}`
      break

    case 'bitbucket':
      fileUrl = join(url.pathname, '/src/', gitBranch, filePath)
      if (line) fileUrl += `#lines-${line}`
      break

    default:
      throw new Error(`Git provider not recognized for ${gitSource}`)
  }

  return `${url.protocol}//${url.host}${fileUrl}`
}
