import Link from 'next/link'
import { PostsCollection, type PostSource } from '@/collections'

export default async function Posts() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {(await PostsCollection.getSources(1)).map((Source) => (
          <PostItem key={Source.getPath()} Source={Source} />
        ))}
      </ul>
    </>
  )
}

async function PostItem({ Source }: { Source: PostSource }) {
  const pathname = Source.getPath()
  const frontmatter = await Source.getNamedExport('frontmatter')
    .getValue()
    .catch(() => null)

  return (
    <li key={pathname}>
      <Link href={pathname}>
        {frontmatter ? (
          <>
            <h2>{frontmatter.title}</h2>
            <p>{frontmatter.description}</p>
          </>
        ) : (
          <h2>{Source.getTitle()}</h2>
        )}
      </Link>
    </li>
  )
}
