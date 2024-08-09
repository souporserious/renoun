import Link from 'next/link'

import { PostsCollection, type PostSource } from '@/collections'

export async function generateStaticParams() {
  return (await PostsCollection.getSources()).map((Source) => ({
    slug: Source.getPathSegments(),
  }))
}

export default async function Post({ params }: { params: { slug: string[] } }) {
  const PostSource = PostsCollection.getSource(params.slug)!
  const [PreviousSource, NextSource] = await PostSource.getSiblings()
  const Content = await PostSource.getDefaultExport()
    .getValue()
    .catch(() => null)
  const updatedAt = await PostSource.getUpdatedAt()
  const editPath = PostSource.getEditPath()

  return (
    <>
      <Link href={PostsCollection.getPath()}>
        All {PostsCollection.getTitle()}
      </Link>

      {Content ? <Content /> : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: '1rem',
        }}
      >
        {updatedAt ? (
          <div style={{ gridColumn: 1, textAlign: 'left' }}>
            Last updated: {new Date(updatedAt).toLocaleString()}
          </div>
        ) : null}

        {editPath ? (
          <a href={editPath} style={{ gridColumn: 2, textAlign: 'right' }}>
            Edit this page
          </a>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: '1rem',
        }}
      >
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
  const frontmatter = await Source.getNamedExport('frontmatter')
    .getValue()
    .catch(() => null)

  return (
    <Link
      href={pathname}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {frontmatter ? frontmatter.title : Source.getTitle()}
    </Link>
  )
}
