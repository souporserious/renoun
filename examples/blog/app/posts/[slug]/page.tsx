import { createCollection, type MDXContent } from 'mdxts/collections'
import Link from 'next/link'

export const PostsCollection = createCollection<{
  default: MDXContent
  frontmatter: {
    title: string
    description: string
  }
}>('@/posts/*.mdx')

export default async function Page({ params }: { params: { slug: string } }) {
  const Post = (await PostsCollection.getSource(params.slug))
    .getDefaultExport()
    .getValue()
  return (
    <>
      <Link href="/posts">All Posts</Link>
      <Post />
    </>
  )
}
