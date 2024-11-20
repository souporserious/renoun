import Link from 'next/link'
import { posts } from '@/collections'

export default async function Page() {
  const allPosts = await posts.getEntries()

  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts
          .filter((post) => post.hasExtension('mdx'))
          .map(async (post) => {
            const path = post.getPath()
            const frontmatter = await post
              .getExport('frontmatter')
              .getRuntimeValue()

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
