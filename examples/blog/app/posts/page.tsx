import Link from 'next/link'
import { PostsCollection } from './[slug]/page'

export default async function Page() {
  const AllPostSources = await PostsCollection.getAllSources()
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {AllPostSources.map((PostSource) => {
          const { title, description } =
            PostSource.getNamedExport('frontmatter').getValue()
          const path = PostSource.getPath()
          return (
            <li key={path}>
              <Link href={path}>
                <h2>{title}</h2>
                <p>{description}</p>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
