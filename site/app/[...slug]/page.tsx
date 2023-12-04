import { notFound } from 'next/navigation'
import { allDocs, allComponents } from 'data'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return [...allDocs.paths(), ...allComponents.paths()].map((pathname) => ({
    slug: pathname,
  }))
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const doc = await allDocs.get(params.slug)
  const component = await allComponents.get(params.slug)
  const module = doc || component || null

  if (module === null) {
    return notFound()
  }

  const { Content, headings, types } = module

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
          <Content />
          {types?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <h2>Props</h2>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {types.map((doc) => (
                  <div
                    key={doc.name}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <h3>{doc.name}</h3>
                    {/* {doc.path && (
                    <a href={getSourceLink({ path: doc.path })}>View Source</a>
                  )} */}
                    {doc.props?.map((type) => (
                      <div
                        key={type.name}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 8,
                          }}
                        >
                          <h4 style={{ fontWeight: 600, margin: 0 }}>
                            {type.name} {type.required && '*'}
                          </h4>
                          <code>
                            {type.type}{' '}
                            {type.defaultValue && `= ${type.defaultValue}`}
                          </code>
                        </div>
                        {type.description && (
                          <p style={{ margin: 0 }}>{type.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
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
        <SiblingLink module={module.previous} direction="previous" />
        <SiblingLink module={module.next} direction="next" />
      </nav>
    </>
  )
}

function SiblingLink({
  module,
  direction,
}: {
  module: { pathname: string; title: string }
  direction: 'previous' | 'next'
}) {
  if (!module) {
    return null
  }

  return (
    <a
      href={module.pathname}
      style={{
        gridColumn: direction === 'previous' ? 1 : 3,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      {module.title}
    </a>
  )
}
