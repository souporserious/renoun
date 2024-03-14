import { remarkPlugin } from '../remark'
import { rehypePlugin } from '../rehype'

/** MDXTS specific plugins for `rehype` and `remark`. */
export async function getMdxPlugins({
  gitSource,
}: {
  gitSource?: string
} = {}): Promise<{ remarkPlugins: any[]; rehypePlugins: any[] }> {
  const allPlugins = await Promise.all([
    import('remark-gfm'),
    import('remark-github'),
    import('remark-smartypants'),
    import('remark-strip-badges'),
    import('remark-squeeze-paragraphs'),
    import('remark-unwrap-images'),
  ])
  const [
    remarkGfm,
    remarkGitHub,
    remarkSmartyPants,
    remarkStripBadges,
    remarkSqueezeParagraphs,
    remarkUnwrapImages,
  ] = allPlugins.map((plugin) => plugin.default)
  return {
    remarkPlugins: [
      remarkGfm,
      gitSource?.includes('github')
        ? [remarkGitHub, { repository: gitSource }]
        : undefined,
      remarkSmartyPants,
      remarkStripBadges,
      remarkSqueezeParagraphs,
      remarkUnwrapImages,
      remarkPlugin,
    ].filter(Boolean),
    rehypePlugins: [rehypePlugin],
  }
}
