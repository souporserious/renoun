import Link from 'next/link'
import { PostsCollection } from './[slug]/page'

export default async function Posts() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {PostsCollection.getSources().map((PostSource) => (
          <PostItem key={PostSource.getPathname()} PostSource={PostSource} />
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
  const pathname = PostSource.getPathname()
  const frontmatter = await PostSource.getNamedExport('frontmatter').getValue()
  return (
    <li key={pathname}>
      <Link href={pathname}>
        {frontmatter ? (
          <>
            <h2>{frontmatter.title}</h2>
            <p>{frontmatter.description}</p>
          </>
        ) : (
          <h2>{pathname}</h2>
        )}
      </Link>
    </li>
  )
}
