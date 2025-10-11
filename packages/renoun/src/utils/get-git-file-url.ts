import { join } from 'path'

/** Constructs a URL for a file in a Git host repository. Supports GitHub, GitLab, and Bitbucket. */
export function getGitFileUrl(
  filePath: string,
  line: number = 0,
  column: number = 0,
  gitSource: string,
  gitBranch: string = 'main',
  gitHost?: string
): string {
  if (!gitSource) {
    throw new Error(
      `[renoun] A git source is required to construct a source file URL. Received an empty string. Ensure the \`git.source\` property is configured on the \`RootProvider\` component. For more information, visit: https://www.renoun.dev/docs/configuration#git-information`
    )
  }

  const url = new URL(gitSource)
  let fileUrl: string
  let host = gitHost

  if (!host) {
    host = gitSource.replace(/^https?:\/\/(?:.*\.)?(.*?)\..*/gm, `$1`)
  }

  switch (host) {
    case 'github': {
      fileUrl = join(url.pathname, '/blob/', gitBranch, filePath)

      const hasLine = typeof line === 'number' && line > 0
      const hasColumn = typeof column === 'number' && column > 0

      if (hasLine || hasColumn) {
        fileUrl += `?plain=1`
      }
      if (hasLine) {
        fileUrl += `#L${line}`
      }
      if (hasColumn) {
        fileUrl += `:${column}`
      }

      break
    }

    case 'gitlab': {
      fileUrl = join(url.pathname, '/-/blob/', gitBranch, filePath)
      if (typeof line === 'number' && line > 0) {
        fileUrl += `#L${line}`
      }
      break
    }

    case 'bitbucket': {
      fileUrl = join(url.pathname, '/src/', gitBranch, filePath)
      if (typeof line === 'number' && line > 0) {
        fileUrl += `#lines-${line}`
      }
      break
    }

    default:
      throw new Error(`Git host not recognized for ${gitSource}`)
  }

  return `${url.protocol}//${url.host}${fileUrl}`
}
