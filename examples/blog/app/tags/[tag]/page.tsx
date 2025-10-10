import { createSlug } from 'renoun'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { posts } from '@/collections'

async function getPostsGroupedByTag() {
  const entries = await posts.getEntries()
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  })

  return Promise.all(
    entries.map(async (entry) => {
      const frontmatter = await entry.getExportValue('frontmatter')

      return {
        pathname: entry.getPathname(),
        frontmatter,
        formattedDate: formatter.format(frontmatter.date),
        tags: (frontmatter.tags ?? []).map((tag: string) => ({
          label: tag,
          slug: createSlug(tag),
        })),
      }
    })
  )
}

export async function generateStaticParams() {
  const postsByTag = await getPostsGroupedByTag()
  const uniqueTags = new Map<string, string>()

  postsByTag.forEach(({ tags }) => {
    tags.forEach(({ label, slug }) => {
      if (!uniqueTags.has(slug)) {
        uniqueTags.set(slug, label)
      }
    })
  })

  return Array.from(uniqueTags.keys()).map((tag) => ({ tag }))
}

export default async function TagPage(props: PageProps<'/tags/[tag]'>) {
  const { tag } = await props.params
  const postsByTag = await getPostsGroupedByTag()
  const matchingPosts = postsByTag
    .filter(({ tags }) => tags.some(({ slug }) => slug === tag))
    .sort((a, b) => b.frontmatter.date.getTime() - a.frontmatter.date.getTime())

  if (matchingPosts.length === 0) {
    notFound()
  }

  const displayTag =
    matchingPosts[0].tags.find(({ slug }) => slug === tag)?.label ?? tag

  return (
    <main className="page">
      <header className="page__hero">
        <h1>Posts tagged “{displayTag}”</h1>
        <p>
          Articles that mention {displayTag.toLowerCase()} in this renoun
          example. Browse all posts to see everything the collection has to
          offer.
        </p>
      </header>

      <section>
        <ul className="post-list">
          {matchingPosts.map(
            ({ pathname, frontmatter, formattedDate, tags }) => (
              <li key={pathname} className="post-list__item">
                <article>
                  <h2>
                    <Link href={pathname}>{frontmatter.title}</Link>
                  </h2>
                  <div className="post-list__meta">
                    <time dateTime={frontmatter.date.toISOString()}>
                      {formattedDate}
                    </time>
                    {tags.length ? (
                      <ul className="post-list__tags">
                        {tags.map(({ label, slug }) => (
                          <li key={label}>
                            <Link href={`/tags/${slug}`}>{label}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {frontmatter.summary ? <p>{frontmatter.summary}</p> : null}
                </article>
              </li>
            )
          )}
        </ul>
      </section>

      <Link href="/" className="post__back">
        Back to posts
      </Link>
    </main>
  )
}
