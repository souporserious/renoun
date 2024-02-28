import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import type { MDXComponents } from 'mdxts/components'
import { CodeInline, MDXContent } from 'mdxts/components'
import { PageContainer } from 'components/PageContainer'
import { ViewSource } from 'components/ViewSource'
import { allData, allPackages } from 'data'
import { getSiteMetadata } from 'utils/get-site-metadata'

const mdxComponents = {
  p: (props) => <p {...props} style={{ margin: 0 }} />,
  code: (props) => {
    if (typeof props.children == 'string') {
      return <CodeInline value={props.children} language="typescript" />
    }
    return <code {...props} />
  },
} satisfies MDXComponents

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allPackages.paths().map((pathname) => ({ slug: pathname.slice(1) }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string[] }
}) {
  const data = await allPackages.get(['packages', ...params.slug])
  return getSiteMetadata({
    title: `${data?.title} - MDXTS`,
    description: data?.description,
  })
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const singlePackage = await allData.get(['packages', ...params.slug])

  if (singlePackage === undefined) {
    return notFound()
  }

  const { Content, title, description, examples, exportedTypes, isServerOnly } =
    singlePackage

  return (
    <PageContainer dataSource={singlePackage}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        {title ? <h1 style={{ margin: 0 }}>{title}</h1> : null}
        {isServerOnly ? (
          <span
            style={{
              fontSize: 'var(--font-size-body-2)',
              padding: '0.25rem 0.8rem',
              border: '1px solid #3F687E',
              borderRadius: '1rem',
              flexShrink: 0,
            }}
          >
            Server Only
          </span>
        ) : null}
      </div>

      {description ? (
        <MDXContent
          value={description}
          components={{ code: mdxComponents.code }}
        />
      ) : null}

      {Content ? <Content /> : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2.8rem',
        }}
      >
        {examples.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.6rem',
            }}
          >
            <h2 id="examples">Examples</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
                gap: '1rem',
              }}
            >
              {examples.map((example) => (
                <div
                  key={example.slug}
                  id={example.slug}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    padding: '0.5rem',
                    gap: '0.8rem',
                    border: '1px solid var(--color-separator)',
                    borderRadius: '0.25rem',
                    backgroundColor: 'var(--color-surface-2)',
                  }}
                >
                  <h3 style={{ flexShrink: 0, margin: 0 }}>{example.name}</h3>
                  <div
                    style={{
                      height: '10rem',
                      padding: '1rem',
                      overflow: 'hidden',
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-separator-secondary)',
                    }}
                  >
                    <div
                      style={{
                        '--scale': 0.4,
                        display: 'flex',
                        transformOrigin: 'top left',
                        scale: 'var(--scale)',
                        width: 'calc(100% / var(--scale))',
                        height: 'calc(100% / var(--scale))',
                      }}
                    >
                      <div style={{ margin: 'auto' }}>
                        <example.moduleExport />
                      </div>
                    </div>
                  </div>
                  <a
                    href={`/examples${example.pathname}`}
                    style={{
                      position: 'absolute',
                      inset: 0,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {exportedTypes.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h2 id="api-reference">API Reference</h2>
            {exportedTypes.map((type, index) => {
              const isActive = singlePackage.pathname === type.pathname
              return (
                <div
                  key={type.name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: isActive ? '3.2rem 0' : '1.6rem 0',
                    borderTop:
                      index === 0
                        ? undefined
                        : '1px solid var(--color-separator-secondary)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.8rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '1rem',
                      }}
                    >
                      {isActive ? (
                        <h3
                          id={type.slug}
                          style={{ fontWeight: 500, margin: 0 }}
                        >
                          {type.name}
                        </h3>
                      ) : (
                        <a href={type.pathname}>
                          <h3
                            id={type.slug}
                            style={{ fontWeight: 500, margin: 0 }}
                          >
                            {type.name}
                          </h3>
                        </a>
                      )}

                      {isActive && type.sourcePath && (
                        <ViewSource href={type.sourcePath} />
                      )}
                    </div>
                    {type.description ? (
                      <MDXContent
                        value={type.description}
                        components={mdxComponents}
                      />
                    ) : null}
                  </div>

                  {isActive && type.types.length > 0 ? (
                    <Props props={type.types} isComponent={type.isComponent} />
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

function Props({
  props,
  isComponent,
}: {
  props: any[] | null
  isComponent: boolean
}) {
  return props?.map((propType, index) => {
    if (propType === null) {
      return null
    }

    if (
      isComponent &&
      propType.unionProperties &&
      propType.unionProperties.length > 0
    ) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: '1.5rem',
          }}
        >
          <h4
            style={{
              fontWeight: 500,
              marginBottom: '2rem',
              color: 'var(--color-foreground-secondary)',
            }}
          >
            {propType.text}
          </h4>
          {propType.description && (
            <MDXContent
              value={propType.description}
              components={mdxComponents}
            />
          )}
          <div
            style={{
              padding: '0 1.5rem',
              margin: '0 0 0 -1.5rem',
              border: '1px solid var(--color-separator-secondary)',
              borderRadius: '1rem',
              position: 'relative',
            }}
          >
            <span
              className="title"
              style={{
                position: 'absolute',
                left: '2rem',
                top: 0,
                translate: '0 -50%',
                padding: '0.25rem 0.5rem',
                margin: '0 0 0 -1rem',
                borderRadius: '1rem',
                backgroundColor: 'var(--color-separator-secondary)',
              }}
            >
              Union
            </span>
            {propType.unionProperties.map((props: any, index: number) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      margin: '0 -1.5rem',
                    }}
                  >
                    <div
                      style={{
                        height: 1,
                        backgroundColor: 'var(--color-separator-secondary)',
                      }}
                    />
                    <div style={{ height: 1 }}>
                      <span
                        style={{
                          fontSize: 'var(--font-size-body-2)',
                          padding: '0.1rem 1rem 0.25rem',
                          border: '1px solid var(--color-separator-secondary)',
                          borderRadius: '1rem',
                          color: 'var(--color-foreground-secondary)',
                          position: 'relative',
                          top: '-0.95rem',
                          userSelect: 'none',
                        }}
                      >
                        or
                      </span>
                    </div>
                    <div
                      style={{
                        height: 1,
                        backgroundColor: 'var(--color-separator-secondary)',
                      }}
                    />
                  </div>
                ) : null}
                <Props props={props} isComponent={isComponent} />
              </Fragment>
            ))}
          </div>
          <Props props={propType.properties} isComponent={isComponent} />
        </div>
      )
    }

    if (propType.name === null) {
      return propType.properties ? (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <Props props={propType.properties} isComponent={isComponent} />
        </div>
      ) : (
        <div key={index}>
          {isComponent ? 'Props' : 'Types'}{' '}
          <CodeInline value={propType.text} language="typescript" />
        </div>
      )
    }

    return (
      <div
        key={propType.name}
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem 0',
          gap: '0.8rem',
          borderTop: index === 0 ? 'none' : '1px solid var(--color-separator)',
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
              fontWeight: 400,
              color: 'var(--color-foreground-secondary)',
            }}
          >
            {propType.name}{' '}
            {propType.required && (
              <span style={{ color: 'oklch(0.8 0.15 36.71)' }} title="required">
                *
              </span>
            )}
          </h4>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <CodeInline
              value={propType.text}
              language="typescript"
              paddingHorizontal="0.5rem"
              paddingVertical="0.2rem"
            />
            {propType.defaultValue ? (
              <span
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                ={' '}
                <CodeInline
                  value={propType.defaultValue}
                  language="typescript"
                />
              </span>
            ) : null}
          </div>
        </div>
        {propType.description && (
          <MDXContent value={propType.description} components={mdxComponents} />
        )}

        {propType.properties && propType.properties.length > 0 ? (
          <div style={{ paddingLeft: '2rem' }}>
            <Props props={propType.properties} isComponent={isComponent} />
          </div>
        ) : null}
      </div>
    )
  })
}
