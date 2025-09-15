import { join } from 'path'

/** Constructs a URL for a specific file in a Git repository. Supports GitHub, GitLab, and Bitbucket. */
export function getGitFileUrl(
  filePath: string,
  line: number = 0,
  column: number = 0,
  gitSource: string,
  gitBranch: string = 'main',
  gitHost?: string
): string {
  if (gitSource.length === 0) {
    throw new Error(
      `[renoun] A git source is required to construct a source file URL. Received an empty string. Ensure the \`git.source\` property is configured on the \`RootProvider\` component. For more information, visit: https://renoun.dev/docs/configuration`
    )
  }

  const url = new URL(gitSource)
  let fileUrl: string

  const host =
    gitHost || gitSource.replace(/^https?:\/\/(?:.*\.)?(.*?)\..*/gm, `$1`)

  switch (host) {
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
      throw new Error(`Git host not recognized for ${gitSource}`)
  }

  return `${url.protocol}//${url.host}${fileUrl}`
}
