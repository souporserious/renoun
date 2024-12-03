import { posts } from '@/collections'

export async function generateStaticParams() {
  const allPosts = await posts.getEntries()
  return allPosts.map((post) => ({ slug: post.getName() }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const post = await posts.getFileOrThrow((await params).slug, 'mdx')
  const frontmatter = await (
    await post.getExport('frontmatter')
  ).getRuntimeValue()
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(frontmatter.date)
  const Content = await (await post.getExport('default')).getRuntimeValue()

  return (
    <>
      <h1>{frontmatter.title}</h1>
      <time>{formattedDate}</time>
      <Content />
    </>
  )
}
