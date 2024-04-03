import { posts } from '../data'

export function generateStaticParams() {
  return posts.paths().map((pathname) => ({ slug: pathname.at(-1) }))
}

export default async function Page({ params }: { params: { slug: string } }) {
  const { Content, frontMatter } = await posts.get(`blog/${params.slug}`)
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(frontMatter.date))

  return (
    <>
      <h1>{frontMatter.title}</h1>
      <time>{formattedDate}</time>
      <Content />
    </>
  )
}
