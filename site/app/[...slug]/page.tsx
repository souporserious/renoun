import { notFound } from 'next/navigation'
import { allDocs } from 'data'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allDocs.paths().map((pathname) => ({ slug: pathname }))
}

export default function Page({ params }) {
  const doc = allDocs.get(params.slug)

  if (doc.active === undefined) {
    return notFound()
  }

  const { Component } = doc.active

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 140px',
          gap: '2rem',
        }}
      >
        <div>
          <Component />
        </div>
        <nav>
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              margin: 0,
              marginTop: 'calc(var(--font-size-heading-1) + 1rem)',
              position: 'sticky',
              top: '2rem',
            }}
          >
            {doc.active.headings?.map(({ text, depth, id }) =>
              depth > 1 ? (
                <li
                  key={id}
                  style={{
                    fontSize: '0.875rem',
                    padding: '0.25rem 0',
                    paddingLeft: (depth - 1) * 0.5 + 'rem',
                  }}
                >
                  <a href={`#${id}`}>{text}</a>
                </li>
              ) : null
            )}
          </ul>
        </nav>
      </div>
      <nav
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(16px, 1fr) auto',
          padding: '4rem 0 2rem',
        }}
      >
        {doc.previous ? (
          <a
            href={doc.previous.pathname}
            style={{ gridColumn: 1, textAlign: 'left' }}
          >
            {doc.previous.title}
          </a>
        ) : null}
        {doc.next ? (
          <a
            href={doc.next.pathname}
            style={{ gridColumn: 3, textAlign: 'right' }}
          >
            {doc.next.title}
          </a>
        ) : null}
      </nav>
    </>
  )
}
