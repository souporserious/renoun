import { createCollection, type MDXContent } from 'mdxts/collections'
import Link from 'next/link'

export const PostsCollection = createCollection<{
  default: MDXContent
  frontmatter: {
    title: string
    description: string
  }
}>('@/posts/*.mdx')

export default async function Page({ params }: { params: { slug: string } }) {
  const PostSource = await PostsCollection.getSource(params.slug)
  const [PreviousSource, NextSource] = await PostSource.getSiblings()
  const Post = PostSource.getDefaultExport().getValue()

  return (
    <>
      <Link href="/posts">All Posts</Link>
      <Post />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {PreviousSource ? (
          <Link
            href={PreviousSource.getPath()}
            style={{ gridColumn: 1, textAlign: 'left' }}
          >
            <div>Previous</div>
            {PreviousSource.getNamedExport('frontmatter').getValue().title}
          </Link>
        ) : null}
        {NextSource ? (
          <Link
            href={NextSource.getPath()}
            style={{ gridColumn: 2, textAlign: 'right' }}
          >
            <div>Next</div>
            {NextSource.getNamedExport('frontmatter').getValue().title}
          </Link>
        ) : null}
      </div>
    </>
  )
}
