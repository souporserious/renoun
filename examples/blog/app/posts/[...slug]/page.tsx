import { createCollection, type MDXContent } from 'mdxts/collections'
import Link from 'next/link'

export const PostsCollection = createCollection<{
  default: MDXContent
  frontmatter?: {
    title: string
    description: string
  }
}>('@/posts/**/*.mdx', {
  baseDirectory: 'posts',
  basePathname: 'posts',
})

export default async function Post({ params }: { params: { slug: string[] } }) {
  const PostSource = PostsCollection.getSource(['posts', ...params.slug])
  const [PreviousSource, NextSource] = PostSource.getSiblings()
  const Content = await PostSource.getDefaultExport().getValue()
  const updatedAt = await PostSource.getUpdatedAt()

  return (
    <>
      <Link href="/posts">All Posts</Link>
      <Content />
      {updatedAt ? (
        <div>Last updated: {new Date(updatedAt).toLocaleString()}</div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {PreviousSource ? (
          <SiblingLink Source={PreviousSource} direction="previous" />
        ) : null}
        {NextSource ? (
          <SiblingLink Source={NextSource} direction="next" />
        ) : null}
      </div>
    </>
  )
}

async function SiblingLink({
  Source,
  direction,
}: {
  Source: ReturnType<(typeof PostsCollection)['getSource']>
  direction: 'previous' | 'next'
}) {
  const pathname = Source.getPathname()
  const frontmatter = await Source.getNamedExport('frontmatter').getValue()
  return (
    <Link
      href={pathname}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {frontmatter ? frontmatter.title : pathname}
    </Link>
  )
}
