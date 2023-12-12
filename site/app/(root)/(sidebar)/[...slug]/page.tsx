import { notFound } from 'next/navigation'
import { SiblingLinks } from 'components/SiblingLinks'
import { allDocs } from 'data'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allDocs.paths().map((pathname) => ({ slug: pathname }))
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const doc = await allDocs.get(params.slug)

  if (doc === null) {
    return notFound()
  }

  const { Content, headings, sourcePath } = doc

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 140px',
        gap: '2rem',
      }}
    >
      <div>
        <Content />
        <SiblingLinks previous={doc.previous} next={doc.next} />
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
          {headings?.map(({ text, depth, id }) =>
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
          {sourcePath ? (
            <>
              <li style={{ margin: '0.8rem 0' }}>
                <hr
                  style={{
                    border: 'none',
                    height: 1,
                    backgroundColor: '#333',
                  }}
                />
              </li>
              <li style={{ paddingLeft: '0.5rem' }}>
                <a
                  href={sourcePath}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.875rem' }}
                >
                  View Source
                </a>
              </li>
            </>
          ) : null}
        </ul>
      </nav>
    </div>
  )
}
