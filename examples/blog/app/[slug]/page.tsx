import { createSlug } from 'renoun'
import Link from 'next/link'
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
  const Content = await post.getExportValue('default')
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  })
  const tags = (frontmatter.tags ?? []).map((tag) => ({
    label: tag,
    slug: createSlug(tag),
  }))

  return (
    <main className="post">
      <Link href="/" className="post__back">
        Back to posts
      </Link>

      <header className="post__header">
        <h1 className="post__title">{frontmatter.title}</h1>
        <div className="post__meta">
          <time dateTime={frontmatter.date.toISOString().slice(0, 10)}>
            {formatter.format(frontmatter.date)}
          </time>
          {tags.length ? (
            <ul className="post__tags">
              {tags.map(({ label, slug }) => (
                <li key={label} className="post__tag">
                  <Link href={`/tags/${slug}`}>{label}</Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {frontmatter.summary ? <p>{frontmatter.summary}</p> : null}
      </header>

      <article>
        <Content />
      </article>
    </main>
  )
}
