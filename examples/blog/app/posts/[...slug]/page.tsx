import {
  createCollection,
  type MDXContent,
  type FileSystemSource,
} from 'mdxts/collections'
import Link from 'next/link'

export type PostSchema = {
  default: MDXContent
  frontmatter?: {
    title: string
    description: string
  }
}

export type PostSource = FileSystemSource<PostSchema>

export const PostsCollection = createCollection<PostSchema>(
  '@/posts/**/*.mdx',
  {
    baseDirectory: 'posts',
    basePath: 'posts', // TODO: test this works without specifying
  }
)

export default async function Post({ params }: { params: { slug: string[] } }) {
  const PostSource = PostsCollection.getSource(params.slug)!
  const [PreviousSource, NextSource] = PostSource.getSiblings()
  const Content = await PostSource.getDefaultExport().getValue()
  const updatedAt = await PostSource.getUpdatedAt()

  return (
    <>
      <Link href="/posts">All Posts</Link>
      {/* <Link href={PostsCollection.getPathname()}>
        All {PostsCollection.getLabel()}
      </Link> */}

      {Content ? <Content /> : null}

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
  Source: PostSource
  direction: 'previous' | 'next'
}) {
  const pathname = Source.getPath()
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
