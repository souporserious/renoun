import remarkTypography from 'remark-typography'

import { remarkPlugin } from '../remark'
import { rehypePlugin } from '../rehype'

/** MDXTS specific plugins for `rehype` and `remark`. */
export async function getMdxPlugins({
  gitSource,
}: {
  gitSource?: string
} = {}): Promise<{ remarkPlugins: any[]; rehypePlugins: any[] }> {
  const [
    remarkGfm,
    remarkGitHub,
    remarkStripBadges,
    remarkSqueezeParagraphs,
    remarkUnwrapImages,
  ] = await Promise.all([
    import('remark-gfm').then((mod) => mod.default),
    import('remark-github').then((mod) => mod.default),
    import('remark-strip-badges').then((mod) => mod.default),
    import('remark-squeeze-paragraphs').then((mod) => mod.default),
    import('remark-unwrap-images').then((mod) => mod.default),
  ])
  return {
    remarkPlugins: [
      remarkGfm,
      gitSource?.includes('github')
        ? [remarkGitHub, { repository: gitSource }]
        : undefined,
      remarkStripBadges,
      remarkSqueezeParagraphs,
      remarkUnwrapImages,
      remarkTypography,
      remarkPlugin,
    ].filter(Boolean),
    rehypePlugins: [rehypePlugin],
  }
}
