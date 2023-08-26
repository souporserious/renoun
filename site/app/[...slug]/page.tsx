import { notFound } from 'next/navigation'
import { allDocs } from 'data'

export default function Page({ params }) {
  const doc = allDocs[`docs/${params.slug.join('/')}`]

  if (doc == undefined) {
    return notFound()
  }

  const Component = doc.default

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '1rem',
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
            position: 'sticky',
            top: '2rem',
          }}
        >
          {doc.headings?.map(({ text, depth, id }) =>
            depth > 1 ? (
              <li
                key={id}
                style={{
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
  )
}
