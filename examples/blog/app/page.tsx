import Link from 'next/link'
import { PostsCollection } from '@/collections'

export default async function Page() {
  const allPosts = await PostsCollection.getSources({ depth: 1 })

  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts.map(async (post) => {
          const path = post.getPath()
          const frontmatter = await post.getExport('frontmatter').getValue()

          return (
            <li key={path}>
              <Link href={path}>{frontmatter.title}</Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
