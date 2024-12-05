import {
  isFile,
  isDirectory,
  type JavaScriptFileExportWithRuntime,
} from 'renoun/file-system'
import { APIReference, CodeBlock, Tokens } from 'renoun/components'
import type { Headings } from 'renoun/mdx'
import { notFound } from 'next/navigation'
import { GeistMono } from 'geist/font/mono'

import { CollectionGroup, ComponentsCollection } from '@/collections'
import { MDXContent } from '@/components/MDXContent'
import { SiblingLink } from '@/components/SiblingLink'
import { TableOfContents } from '@/components/TableOfContents'

export async function generateStaticParams() {
  const entries = await ComponentsCollection.getEntries({ recursive: true })

  return entries.map((entry) => ({
    slug: entry.getPathSegments({ includeBasePath: false }),
  }))
}

export default async function Component({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const slug = (await params).slug
  const componentEntry = await ComponentsCollection.getFile(slug, ['ts', 'tsx'])

  if (!componentEntry) {
    notFound()
  }

  const mdxFile = await ComponentsCollection.getFile(slug, 'mdx')
  const mdxHeadings = await mdxFile?.getExportValue('headings')
  const Content = await mdxFile?.getExportValue('default')
  const componentDirectory = isDirectory(componentEntry)
    ? componentEntry
    : componentEntry.getParentDirectory()
  const mainExport = await componentEntry.getExport<any>(slug)
  const description = mainExport ? mainExport.getDescription() : null
  const examplesEntry = await componentDirectory.getEntry('examples')
  const exampleFiles = examplesEntry
    ? isDirectory(examplesEntry)
      ? await examplesEntry
          .withFilter((entry) => isFile(entry, 'tsx'))
          .getEntries()
      : isFile(examplesEntry, 'tsx')
        ? [examplesEntry]
        : null
    : null
  const examplesExports = exampleFiles
    ? (
        await Promise.all(exampleFiles.map(async (file) => file.getExports()))
      ).flat()
    : []
  const isExamplesPage = slug.at(-1) === 'examples'
  const componentExports = isExamplesPage
    ? undefined
    : await componentEntry.getExports()
  const updatedAt = await componentEntry.getUpdatedAt()
  const editPath = componentEntry.getEditPath()
  const [previousEntry, nextEntry] = await componentEntry.getSiblings({
    entryGroup: CollectionGroup,
  })

  let headings: Headings = []

  if (mdxHeadings) {
    headings.push(...mdxHeadings)
  }

  if (examplesExports.length) {
    const parsedExports = examplesExports.map((exampleExport) => ({
      id: exampleExport.getSlug(),
      text: exampleExport.getName(),
      depth: 3,
    }))

    headings.push(
      {
        id: 'examples',
        text: 'Examples',
        depth: 2,
      },
      ...parsedExports
    )
  }

  if (componentExports) {
    headings.push(
      {
        id: 'api-reference',
        text: 'API Reference',
        depth: 2,
      },
      ...componentExports.map((componentExport) => ({
        id: componentExport.getSlug(),
        text: componentExport.getName(),
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
                {componentEntry.getName()} {isExamplesPage ? 'Examples' : ''}
              </h1>
              {description ? <MDXContent value={description} /> : null}
              {Content ? <Content /> : null}
            </div>
          ) : (
            <h1 css={{ fontSize: '3rem', margin: 0 }}>
              {componentEntry.getName()} {isExamplesPage ? 'Examples' : ''}
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
              {examplesExports.map((fileExport) => (
                <li key={fileExport.getName()}>
                  <Preview
                    fileExport={fileExport as JavaScriptFileExportWithRuntime}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {componentExports ? (
          <div>
            <h2 id="api-reference" css={{ margin: '0 0 2rem' }}>
              API Reference
            </h2>
            {componentExports.map((exportSource) => (
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
            {previousEntry ? (
              <SiblingLink
                entry={previousEntry}
                direction="previous"
                variant={
                  ComponentsCollection.hasEntry(previousEntry)
                    ? 'name'
                    : 'title'
                }
              />
            ) : null}
            {nextEntry ? (
              <SiblingLink
                entry={nextEntry}
                direction="next"
                variant={
                  ComponentsCollection.hasEntry(nextEntry) ? 'name' : 'title'
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
  fileExport,
}: {
  fileExport: JavaScriptFileExportWithRuntime<React.ComponentType>
}) {
  const name = fileExport.getName()
  const title = fileExport.getTitle()
  const description = fileExport.getDescription()
  const slug = fileExport.getSlug()
  const editPath = fileExport.getEditPath()
  const Value = await fileExport.getRuntimeValue()
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
        {/* <CodeBlock allowErrors value={fileExport.getText()} language="tsx">
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
        </CodeBlock> */}
      </div>
    </section>
  )
}
