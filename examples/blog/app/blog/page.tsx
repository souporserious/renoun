import { posts } from './data'

export default function Page() {
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {Object.entries(posts.all()).map(([pathname, post]) => (
          <li key={pathname}>
            <a href={pathname}>{post.label}</a>
          </li>
        ))}
      </ul>
    </>
  )
}
