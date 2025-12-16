import { createSlug } from 'renoun'
import Link from 'next/link'
import { posts } from '@/collections'

export default async function Page() {
  const allPosts = await posts.getEntries()
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  })
  const postSummaries = (
    await Promise.all(
      allPosts.map(async (post) => {
        const pathname = post.getPathname()
        const frontmatter = await post.getExportValue('frontmatter')

        return {
          pathname,
          frontmatter,
          formattedDate: formatter.format(frontmatter.date),
          tags: (frontmatter.tags ?? []).map((tag: string) => ({
            label: tag,
            slug: createSlug(tag),
          })),
        }
      })
    )
  ).sort((a, b) => b.frontmatter.date.getTime() - a.frontmatter.date.getTime())

  return (
    <main className="page">
      <header className="page__hero">
        <h1>Field Notes</h1>
        <p>
          A small collection of MDX posts that show how renoun keeps content,
          metadata, and React components close together.
        </p>
      </header>

      <section>
        <ul className="post-list">
          {postSummaries.map(
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
    </main>
  )
}
