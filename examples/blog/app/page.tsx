import Link from 'next/link'
import { allPosts } from '@/data'

export default function Page() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts
          .all()
          .sort((a, b) => {
            return b.frontMatter.date.getTime() - a.frontMatter.date.getTime()
          })
          .map((post) => {
            return (
              <li key={post.pathname}>
                <Link href={post.pathname}>{post.frontMatter.title}</Link>
              </li>
            )
          })}
      </ul>
    </>
  )
}
