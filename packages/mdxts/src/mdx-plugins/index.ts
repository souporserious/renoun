import remarkEmbedder from '@remark-embedder/core'
import CodeSandboxTransformer from '@remark-embedder/transformer-codesandbox'

import { remarkPlugin } from './remark'
import { rehypePlugin } from './rehype'

/**
 * MDXTS specific plugins for `rehype` and `remark`.
 * @internal
 */
export async function getMdxPlugins({
  gitSource,
  gitBranch,
  gitProvider,
}: {
  gitSource?: string
  gitBranch?: string
  gitProvider?: string
} = {}): Promise<{ remarkPlugins: any[]; rehypePlugins: any[] }> {
  const allPlugins = await Promise.all([
    import('remark-frontmatter'),
    import('remark-mdx-frontmatter'),
    import('remark-gfm'),
    import('remark-github'),
    import('remark-smartypants'),
    import('remark-strip-badges'),
    import('remark-squeeze-paragraphs'),
    import('remark-unwrap-images'),
    import('rehype-infer-reading-time-meta'),
  ])
  const [
    remarkFrontMatter,
    remarkMdxFrontMatter,
    remarkGfm,
    remarkGitHub,
    remarkSmartyPants,
    remarkStripBadges,
    remarkSqueezeParagraphs,
    remarkUnwrapImages,
    rehypeInferReadingTimeMeta,
  ] = allPlugins.map((plugin) => plugin.default)
  return {
    remarkPlugins: [
      remarkFrontMatter,
      remarkMdxFrontMatter,
      remarkGfm,
      gitSource?.includes('github')
        ? [remarkGitHub, { repository: gitSource }]
        : undefined,
      remarkSmartyPants,
      remarkStripBadges,
      remarkSqueezeParagraphs,
      remarkUnwrapImages,
      [remarkPlugin, { gitSource, gitBranch, gitProvider }],
      [remarkEmbedder, { transformers: [CodeSandboxTransformer] }],
    ].filter(Boolean),
    rehypePlugins: [rehypeInferReadingTimeMeta, rehypePlugin],
  }
}
