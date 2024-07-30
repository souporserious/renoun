import Link from 'next/link'
import { PostsCollection, type PostSource } from './[...slug]/page'

export default async function Posts() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {PostsCollection.getSources().map((Source) => (
          <PostItem key={Source.getPathname()} Source={Source} />
        ))}
      </ul>
    </>
  )
}

async function PostItem({ Source }: { Source: PostSource }) {
  const pathname = Source.getPathname()
  const frontmatter = await Source.getNamedExport('frontmatter').getValue()

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
