import { getEditorPath } from './get-editor-path'

/**
 * Returns a constructed source link for the local IDE in development or a GitHub
 * link in production.
 */
export function getSourceLink(path: string) {
  if (process.env.NODE_ENV === 'development') {
    return getEditorPath({ path })
  }

  return `${process.env.MDXTS_GIT_SOURCE}${path.replace(process.cwd(), '')}`
}
