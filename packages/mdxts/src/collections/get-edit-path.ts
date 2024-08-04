import { join, posix } from 'node:path'
import { findRootSync } from '@manypkg/find-root'

import { getEditorPath } from '../utils/get-editor-path'
import { getGitFileUrl } from '../utils/get-git-file-url'

const warned = new Set<string>()
let rootDirectory: string | null = null

/** Returns an edit path for the local IDE in development or a git source link in production if configured. */
export function getEditPath(
  path: string,
  line?: number,
  column?: number,
  gitSource: string | undefined = process.env.MDXTS_GIT_SOURCE,
  gitBranch: string | undefined = process.env.MDXTS_GIT_BRANCH,
  gitProvider: string | undefined = process.env.MDXTS_GIT_PROVIDER
) {
  if (process.env.NODE_ENV === 'development') {
    return getEditorPath({ path, line, column })
  }

  if (process.env.NODE_ENV === 'production' && gitSource !== undefined) {
    if (rootDirectory === null) {
      rootDirectory = findRootSync(process.cwd()).rootDir
    }

    const relativeFilePath = path.replace(join(rootDirectory, posix.sep), '')

    if (gitSource === undefined) {
      if (!warned.has(relativeFilePath)) {
        console.warn(
          `[mdxts] \`getSourcePath\` could not determine the source path for "${relativeFilePath}". Ensure \`MDXTS_GIT_SOURCE\` is set in production.`
        )
        warned.add(relativeFilePath)
      }

      return ''
    }

    return getGitFileUrl(
      relativeFilePath,
      line,
      column,
      gitSource!,
      gitBranch,
      gitProvider
    )
  }

  return ''
}
