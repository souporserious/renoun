import Link from 'next/link'
import { PostsCollection } from './[slug]/page'

export default async function Posts() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {PostsCollection.getAllSources().map((PostSource) => (
          <PostItem PostSource={PostSource} />
        ))}
      </ul>
    </>
  )
}

async function PostItem({
  PostSource,
}: {
  PostSource: ReturnType<(typeof PostsCollection)['getSource']>
}) {
  const { title, description } =
    await PostSource.getNamedExport('frontmatter').getValue()
  const path = PostSource.getPathname()
  return (
    <li key={path}>
      <Link href={path}>
        <h2>{title}</h2>
        <p>{description}</p>
      </Link>
    </li>
  )
}
