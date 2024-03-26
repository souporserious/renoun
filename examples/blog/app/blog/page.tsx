import { posts } from './data'

export default function Page() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {posts.all().map((post) => (
          <li key={post.pathname}>
            <a href={post.pathname}>{post.label}</a>
          </li>
        ))}
      </ul>
    </>
  )
}
