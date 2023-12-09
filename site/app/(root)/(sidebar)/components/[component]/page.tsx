import { notFound } from 'next/navigation'
import { Code } from 'mdxts/components'
import { allComponents } from 'data'
import theme from 'theme.json'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allComponents
    .paths()
    .map((pathname) => ({ component: pathname.at(1) }))
}

export default async function Page({
  params,
}: {
  params: { component: string }
}) {
  const component = await allComponents.get(`components/${params.component}`)

  if (component === null) {
    return notFound()
  }

  const { Content, title, description, headings, types, sourcePath } = component

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
          {title ? (
            <h1
              style={{
                // @ts-expect-error
                textWrap: 'balance',
              }}
            >
              {title}
            </h1>
          ) : null}

          {description ? (
            <p
              style={{
                // @ts-expect-error
                textWrap: 'pretty',
              }}
            >
              {description}
            </p>
          ) : null}

          {Content ? <Content /> : null}

          {types?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <h2 id="types">Types</h2>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {types.map((type) => (
                  <div
                    key={type.name}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '0.5rem',
                      }}
                    >
                      <h3 style={{ margin: 0 }}>{type.name}</h3>
                      {type.sourcePath && (
                        <a
                          href={type.sourcePath}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '0.875rem' }}
                        >
                          View Source
                        </a>
                      )}
                    </div>
                    {type.props?.map((type) => (
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
                          <h4
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              flexShrink: 0,
                              margin: 0,
                              fontWeight: 600,
                            }}
                          >
                            {type.name} {type.required && '*'}
                          </h4>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                          >
                            <Code
                              inline
                              value={type.type}
                              language="typescript"
                              theme={theme as any}
                              paddingHorizontal="0.5rem"
                              paddingVertical="0.2rem"
                            />
                            {type.defaultValue ? (
                              <span style={{ fontSize: '0.8rem' }}>
                                = {type.defaultValue}
                              </span>
                            ) : null}
                          </div>
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
      <nav
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(16px, 1fr) auto',
          padding: '4rem 0 2rem',
        }}
      >
        <SiblingLink module={component.previous} direction="previous" />
        <SiblingLink module={component.next} direction="next" />
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
