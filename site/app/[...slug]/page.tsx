import { notFound } from 'next/navigation'
import { allDocs } from 'data'

export default function Page({ params }) {
  const doc = allDocs[`docs/${params.slug[0]}`]

  if (doc == undefined) {
    return notFound()
  }

  const Component = doc.default

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
      }}
    >
      <main>
        <Component />
      </main>
      <aside>
        <nav>
          <ul>
            {doc.headings?.map(({ text, id }) => (
              <li>
                <a href={`#${id}`}>{text}</a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  )
}
