import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import { Code } from 'mdxts/components'
import { SiblingLinks } from 'components/SiblingLinks'
import { TableOfContents } from 'components/TableOfContents'
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.6rem',
            }}
          >
            <h2 id="types" style={{ margin: 0 }}>
              Types
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2rem',
              }}
            >
              {types.map((type) => (
                <div
                  key={type.name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: type.unionProps.length > 0 ? '2rem' : undefined,
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
                  {type.unionProps.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2rem',
                      }}
                    >
                      <div>
                        <h4>Union Props</h4>
                        {type.unionProps.map((props, index) => (
                          <Fragment key={index}>
                            {index > 0 ? (
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr auto 1fr',
                                  alignItems: 'center',
                                  gap: '8px',
                                }}
                              >
                                <div
                                  style={{
                                    height: 1,
                                    backgroundColor: '#333',
                                  }}
                                />
                                <div style={{ height: 1 }}>
                                  <span
                                    style={{
                                      fontSize: '0.875rem',
                                      padding: '0.1rem 1rem',
                                      border: '1px solid #333',
                                      borderRadius: '1rem',
                                      color: '#666',
                                      position: 'relative',
                                      top: -15,
                                      userSelect: 'none',
                                    }}
                                  >
                                    or
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: 1,
                                    backgroundColor: '#333',
                                  }}
                                />
                              </div>
                            ) : null}
                            <Props props={props} />
                          </Fragment>
                        ))}
                      </div>
                      <div>
                        <h4>Base Props</h4>
                        <Props props={type.baseProps} />
                      </div>
                    </div>
                  ) : (
                    <Props props={type.baseProps} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <SiblingLinks previous={component.previous} next={component.next} />
      </div>
      <TableOfContents headings={headings} sourcePath={sourcePath} />
    </div>
  )
}

function Props({ props }: { props: any[] }) {
  return props?.map((propType, index) => (
    <div
      key={propType.name}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem 0',
        gap: '0.5rem',
        borderTop: index === 0 ? 'none' : '1px solid #333',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
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
          {propType.name} {propType.required && '*'}
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
            value={propType.type}
            language="typescript"
            theme={theme as any}
            paddingHorizontal="0.5rem"
            paddingVertical="0.2rem"
          />
          {propType.defaultValue ? (
            <span style={{ fontSize: '0.8rem' }}>
              = {propType.defaultValue}
            </span>
          ) : null}
        </div>
      </div>
      {propType.description && (
        <p style={{ margin: 0 }}>{propType.description}</p>
      )}
    </div>
  ))
}
