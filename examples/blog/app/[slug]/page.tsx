import { posts } from '@/collections'

export async function generateStaticParams() {
  const allPosts = await posts.getEntries()
  return allPosts.map((post) => ({ slug: post.getBaseName() }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const post = await posts.getFile((await params).slug, 'mdx')
  const frontmatter = await post.getExportValue('frontmatter')
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(frontmatter.date)
  const Content = await post.getExportValue('default')

  return (
    <>
      <h1>{frontmatter.title}</h1>
      <time>{formattedDate}</time>
      <Content />
    </>
  )
}
