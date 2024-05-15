import { allPosts } from 'data'

export default function Page() {
  return (
    <div
      className="prose"
      style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <h1>Blog</h1>
        <p>
          Stay updated on new features, releases, and technical walkthroughs of
          how MDXTS is built.
        </p>
      </div>
      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          listStyle: 'none',
          padding: 0,
          gap: '2rem',
        }}
      >
        {allPosts.all().map((post) => {
          return (
            <li key={post.pathname}>
              <a
                href={post.pathname}
                style={{
                  fontSize: 'var(--font-size-heading-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '3rem',
                  gap: '1.5rem',
                  textDecoration: 'none',
                  borderRadius: '1rem',
                  backgroundColor: 'var(--color-surface-interactive)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  <h2
                    style={{
                      textDecoration: 'none',
                      fontSize: 'var(--font-size-heading-2)',
                      margin: 0,
                      color: 'var(--color-foreground)',
                    }}
                  >
                    {post.frontMatter.title}
                  </h2>
                  {post.updatedAt ? (
                    <time
                      dateTime={post.updatedAt}
                      itemProp="dateModified"
                      style={{
                        textDecoration: 'none',
                        fontSize: 'var(--font-size-body-3)',
                        fontWeight: 600,
                        color: 'var(--color-foreground-secondary)',
                      }}
                    >
                      {new Date(post.updatedAt).toLocaleString('en', {
                        year: '2-digit',
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </time>
                  ) : null}
                </div>
                <p style={{ textDecoration: 'none' }}>
                  {post.frontMatter.summary}
                </p>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
