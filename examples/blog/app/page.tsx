import Link from 'next/link'
import { allPosts } from '@/data'

export default function Page() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts.all().map((post) => (
          <li key={post.pathname}>
            <Link href={post.pathname}>{post.label}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}
