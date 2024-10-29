import { APIReference, CodeBlock, Tokens } from 'renoun/components'
import type { Headings } from 'renoun/mdx'
import type { ExportSource } from 'renoun/collections'
import { notFound } from 'next/navigation'
import { GeistMono } from 'geist/font/mono'

import {
  AllCollections,
  ComponentsCollection,
  ComponentsMDXCollection,
} from '@/collections'
import { MDXContent } from '@/components/MDXContent'
import { SiblingLink } from '@/components/SiblingLink'
import { TableOfContents } from '@/components/TableOfContents'

export async function generateStaticParams() {
  const sources = await ComponentsCollection.getSources()
  return sources.map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Component({
  params,
}: {
  params: { slug: string[] }
}) {
  const componentsPathname = ['components', ...params.slug]
  const componentSource = await AllCollections.getSource(componentsPathname)

  if (!ComponentsCollection.hasSource(componentSource)) {
    notFound()
  }

  const mdxSource = await ComponentsMDXCollection.getSource(componentsPathname)
  const mdxHeadings = await mdxSource?.getExport('headings').getValue()
  const Content = await mdxSource?.getExport('default').getValue()
  const examplesSource = await componentSource.getSource('examples')
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
  const mainExport = componentSource.getMainExport()
  const description = mainExport?.getDescription()
  const updatedAt = await componentSource.getUpdatedAt()
  const editPath = componentSource.getEditPath()
  const [previousSource, nextSource] = await componentSource.getSiblings({
    depth: 0,
  })
  let headings: Headings = []

  if (mdxHeadings) {
    headings.push(...mdxHeadings)
  }

  if (examplesExports.length) {
    headings.push(
      {
        id: 'examples',
        text: 'Examples',
        depth: 2,
      },
      ...examplesExports.map((source) => ({
        id: source.getSlug(),
        text: source.getTitle(),
        depth: 3,
      }))
    )
  }

  if (sourceExports) {
    headings.push(
      {
        id: 'api-reference',
        text: 'API Reference',
        depth: 2,
      },
      ...sourceExports.map((source) => ({
        id: source.getSlug(),
        text: source.getName(),
        depth: 3,
      }))
    )
  }

  return (
    <>
      <div css={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
        <div css={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {description || Content ? (
            <div className="prose">
              <h1 css={{ fontSize: '3rem', margin: 0 }}>
                {componentSource.getName()} {isExamplesPage ? 'Examples' : ''}
              </h1>
              {description ? <MDXContent value={description} /> : null}
              {Content ? <Content /> : null}
            </div>
          ) : (
            <h1 css={{ fontSize: '3rem', margin: 0 }}>
              {componentSource.getName()} {isExamplesPage ? 'Examples' : ''}
            </h1>
          )}
        </div>

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

        <div css={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {updatedAt ? (
            <div
              css={{
                fontSize: 'var(--font-size-body-3)',
                color: 'var(--color-foreground-secondary)',
              }}
            >
              Last updated{' '}
              <time
                dateTime={updatedAt.toString()}
                itemProp="dateModified"
                css={{ fontWeight: 600 }}
              >
                {updatedAt.toLocaleString('en', {
                  year: '2-digit',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </time>
            </div>
          ) : null}

          <nav
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2rem',
            }}
          >
            {previousSource ? (
              <SiblingLink
                source={previousSource}
                direction="previous"
                variant={
                  ComponentsCollection.hasSource(previousSource)
                    ? 'name'
                    : 'title'
                }
              />
            ) : null}
            {nextSource ? (
              <SiblingLink
                source={nextSource}
                direction="next"
                variant={
                  ComponentsCollection.hasSource(nextSource) ? 'name' : 'title'
                }
              />
            ) : null}
          </nav>
        </div>
      </div>

      <TableOfContents headings={headings} editPath={editPath} />
    </>
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
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <h3 css={{ margin: 0 }}>{title}</h3>{' '}
          <a href={editPath} css={{ fontSize: 'var(--font-size-body-3)' }}>
            View Source
          </a>
        </div>
        {description ? <p>{description}</p> : null}
      </header>

      <div
        css={{
          display: 'grid',
          gridTemplateRows: isComponent ? 'minmax(16rem, 1fr) auto' : undefined,
          borderRadius: 5,
          boxShadow: '0 0 0 1px var(--color-separator)',
          overflow: 'clip',
        }}
      >
        {isComponent ? (
          <div
            css={{
              fontSize: '1rem',
              lineHeight: '1.35',
              maxWidth: '-webkit-fill-available',
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
              fontSize: 'var(--font-size-code-2)',
              lineHeight: 'var(--line-height-code-2)',
              padding: '0.75rem 1rem',
              overflow: 'auto',
              backgroundColor: 'var(--color-surface-secondary)',
              borderTop: isComponent
                ? '1px solid var(--color-separator)'
                : undefined,
            }}
            className={GeistMono.className}
          >
            <Tokens />
          </pre>
        </CodeBlock>
      </div>
    </section>
  )
}
