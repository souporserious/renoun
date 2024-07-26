import { createCollection } from 'mdxts/collections'

const Posts = createCollection('@/posts/*.mdx')

export default async function Page({ params }: { params: { slug: string } }) {
  const Post = (await Posts.getSource(params.slug))
    .getDefaultExport()
    .getValue()
  return <Post />
}
