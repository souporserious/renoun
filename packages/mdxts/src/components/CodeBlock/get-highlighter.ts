import { getHighlighter as getShikiHighlighter } from 'shiki/bundle/web'

import { getTheme } from '../../utils/get-theme'

let highlighter: Awaited<ReturnType<typeof getShikiHighlighter>> | null = null

/** Converts a string of code to an array of highlighted tokens. */
export async function getHighlighter() {
  if (highlighter === null) {
    highlighter = await getShikiHighlighter({
      langs: ['css', 'js', 'jsx', 'ts', 'tsx', 'md', 'mdx', 'sh', 'json'],
      themes: [getTheme()],
    })
  }

  return highlighter
}
