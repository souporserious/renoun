import Link from 'next/link'
import { posts } from '@/collections'

export default async function Page() {
  const allPosts = await posts.getEntries()

  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts.map(async (post) => {
          const pathname = post.getPathname()
          const frontmatter = await post.getExportValue('frontmatter')

          return (
            <li key={pathname}>
              <Link href={pathname}>{frontmatter.title}</Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
