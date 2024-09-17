import { APIReference, CodeBlock, Tokens } from 'renoun/components'
import { type ExportSource } from 'renoun/collections'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ComponentsCollection, type ComponentSource } from '@/collections'

export async function generateStaticParams() {
  const sources = await ComponentsCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Component({
  params,
}: {
  params: { slug: string[] }
}) {
  const componentsPathname = ['components', ...params.slug]
  const componentSource = ComponentsCollection.getSource(componentsPathname)

  if (!componentSource) {
    notFound()
  }

  const examplesSource = componentSource.getSource('examples')
  const examplesSources = await examplesSource?.getSources()
  const isExamplesPage = params.slug.at(-1) === 'examples'
  const examplesExports = isExamplesPage
    ? componentSource.getExports()
    : examplesSource
      ? examplesSources?.length
        ? examplesSources.flatMap((source) => source.getExports())
        : examplesSource.getExports()
      : []
  const sourceExports = isExamplesPage
    ? undefined
    : componentSource.getExports()
  const updatedAt = await componentSource.getUpdatedAt()
  const editPath = componentSource.getEditPath()
  const [previousSource, nextSource] = await componentSource.getSiblings({
    depth: 0,
  })

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '4rem 0',
        gap: '4rem',
      }}
    >
      <h1 css={{ fontSize: '3rem', margin: 0 }}>
        {componentSource.getName()} {isExamplesPage ? 'Examples' : ''}
      </h1>

      <div
        css={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: '2rem',
          '@media (min-width: 768px)': {
            gridTemplateColumns: 'minmax(0, 1fr) 12rem',
          },
        }}
      >
        <div css={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
          {examplesExports.length ? (
            <div>
              <h2 id="examples" css={{ margin: '0 0 2rem' }}>
                Examples
              </h2>
              <ul
                css={{
                  listStyle: 'none',
                  display: 'grid',
                  padding: 0,
                  margin: 0,
                  gap: '2rem',
                }}
              >
                {examplesExports.map((exportSource) => (
                  <li key={exportSource.getSlug()}>
                    <Preview source={exportSource} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sourceExports ? (
            <div>
              <h2 id="api-reference" css={{ margin: '0 0 2rem' }}>
                API Reference
              </h2>
              {sourceExports.map((exportSource) => (
                <APIReference
                  key={exportSource.getSlug()}
                  source={exportSource}
                />
              ))}
            </div>
          ) : null}

          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '1rem',
              }}
            >
              {updatedAt ? (
                <div
                  style={{
                    gridColumn: 1,
                    fontSize: 'var(--font-size-body-3)',
                    color: 'var(--color-foreground-secondary)',
                    textAlign: 'left',
                  }}
                >
                  Last updated{' '}
                  <time
                    dateTime={updatedAt.toString()}
                    itemProp="dateModified"
                    style={{ fontWeight: 600 }}
                  >
                    {updatedAt.toLocaleString('en', {
                      year: '2-digit',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </time>
                </div>
              ) : null}

              {editPath ? (
                <a
                  href={editPath}
                  style={{ gridColumn: 2, textAlign: 'right' }}
                >
                  Edit this page
                </a>
              ) : null}
            </div>

            <nav
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '1rem',
              }}
            >
              {previousSource ? (
                <SiblingLink source={previousSource} direction="previous" />
              ) : null}
              {nextSource ? (
                <SiblingLink source={nextSource} direction="next" />
              ) : null}
            </nav>
          </div>
        </div>

        <aside
          css={{
            alignSelf: 'start',
            position: 'sticky',
            top: '1rem',
            '@media (max-width: 767px)': {
              display: 'none',
            },
          }}
        >
          <nav
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h3 css={{ margin: 0 }}>On this page</h3>
            <ul
              css={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}
            >
              {examplesExports.length ? (
                <li>
                  <a
                    href="#examples"
                    css={{
                      display: 'block',
                      padding: '0.25rem 0',
                    }}
                  >
                    Examples
                  </a>
                  {examplesExports.map((source) => (
                    <ul
                      key={source.getPath()}
                      css={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                      }}
                    >
                      <li>
                        <a
                          href={`#${source.getSlug()}`}
                          css={{
                            display: 'block',
                            padding: '0.25rem 0',
                            paddingLeft: '1rem',
                          }}
                        >
                          {source.getTitle()}
                        </a>
                      </li>
                    </ul>
                  ))}
                </li>
              ) : null}
              {sourceExports ? (
                <li>
                  <a
                    href="#api-reference"
                    css={{
                      display: 'block',
                      padding: '0.25rem 0',
                    }}
                  >
                    API Reference
                  </a>
                  {sourceExports.map((source) => (
                    <ul
                      key={source.getPath()}
                      css={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                      }}
                    >
                      <li>
                        <a
                          href={`#${source.getSlug()}`}
                          css={{
                            display: 'block',
                            padding: '0.25rem 0',
                            paddingLeft: '1rem',
                          }}
                        >
                          {source.getName()}
                        </a>
                      </li>
                    </ul>
                  ))}
                </li>
              ) : null}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  )
}

async function Preview({
  source,
}: {
  source: ExportSource<React.ComponentType>
}) {
  const name = source.getName()
  const title = source.getTitle()
  const description = source.getDescription()
  const slug = source.getSlug()
  const editPath = source.getEditPath()
  const Value = await source.getValue()
  const isUppercase = name[0] === name[0].toUpperCase()
  const isComponent = typeof Value === 'function' && isUppercase

  return (
    <section
      key={slug}
      id={slug}
      css={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <header>
        <div
          css={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <h3 css={{ margin: 0 }}>{title}</h3>{' '}
          <a href={editPath}>View Source</a>
        </div>
        {description ? <p>{description}</p> : null}
      </header>

      <div
        css={{
          display: 'grid',
          gridTemplateRows: isComponent ? 'minmax(16rem, 1fr) auto' : undefined,
          borderRadius: 5,
          boxShadow: '0 0 0 1px #3b4252',
          overflow: 'clip',
        }}
      >
        {isComponent ? (
          <div
            css={{
              padding: '4rem',
              margin: 'auto',
              overflow: 'auto',
            }}
          >
            <Value />
          </div>
        ) : null}
        <CodeBlock allowErrors value={source.getText()} language="tsx">
          <pre
            css={{
              position: 'relative',
              whiteSpace: 'pre',
              wordWrap: 'break-word',
              padding: '0.5lh',
              margin: 0,
              overflow: 'auto',
              backgroundColor: '#09121b',
            }}
          >
            <Tokens />
          </pre>
        </CodeBlock>
      </div>
    </section>
  )
}

async function SiblingLink({
  source,
  direction,
}: {
  source: ComponentSource
  direction: 'previous' | 'next'
}) {
  return (
    <Link
      href={source.getPath()}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {source.getName()}
    </Link>
  )
}
