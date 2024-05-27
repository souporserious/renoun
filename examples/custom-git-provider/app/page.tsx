import Link from 'next/link'
import { allPosts } from '@/data'

export default function Page() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts.all().map((post) => {
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
