import { join, sep } from 'node:path'
import { findRootSync } from '@manypkg/find-root'

import { getEditorPath } from './get-editor-path'
import { getGitFileUrl } from './get-git-file-url'

const warned = new Set<string>()
let rootDirectory: string | null = null

/**
 * Returns a constructed source path for the local IDE in development or a git link in production.
 */
export function getSourcePath(
  path: string,
  line?: number,
  column?: number,
  gitSource: string | undefined = process.env.MDXTS_GIT_SOURCE,
  gitBranch: string | undefined = process.env.MDXTS_GIT_BRANCH
) {
  if (process.env.NODE_ENV === 'development') {
    return getEditorPath({ path, line, column })
  }

  if (rootDirectory === null) {
    rootDirectory = findRootSync(process.cwd()).rootDir
  }

  const relativeFilePath = path.replace(join(rootDirectory, sep), '')

  if (process.env.NODE_ENV === 'production' && gitSource !== undefined) {
    return getGitFileUrl(relativeFilePath, line, column, gitSource, gitBranch)
  }

  if (!warned.has(relativeFilePath)) {
    console.warn(
      `[mdxts] \`getSourcePath\` could not determine the source path for "${relativeFilePath}". Ensure \`MDXTS_GIT_SOURCE\` is set in production.`
    )
    warned.add(relativeFilePath)
  }

  return ''
}
