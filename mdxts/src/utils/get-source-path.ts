import { findRootSync } from '@manypkg/find-root'
import { getEditorPath } from './get-editor-path'

let rootDirectory = null

/**
 * Returns a constructed source path for the local IDE in development or a git link in production.
 */
export function getSourcePath(path: string) {
  if (process.env.NODE_ENV === 'development') {
    return getEditorPath({ path })
  }
  if (rootDirectory === null) {
    rootDirectory = findRootSync(process.cwd()).rootDir
  }
  return `${process.env.MDXTS_GIT_SOURCE}${path.replace(rootDirectory, '')}`
}
