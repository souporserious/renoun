import {
  isFile,
  isDirectory,
  FileNotFoundError,
  FileExportNotFoundError,
  type JavaScriptFile,
  type JavaScriptFileExport,
} from 'renoun/file-system'
import { APIReference, CodeBlock, Tokens } from 'renoun/components'
import type { MDXHeadings } from 'renoun/mdx'
import { GeistMono } from 'geist/font/mono'

import { CollectionGroup, ComponentsCollection } from '@/collections'
import { MDX } from '@/components/MDX'
import { SiblingLink } from '@/components/SiblingLink'
import { TableOfContents } from '@/components/TableOfContents'

export async function generateStaticParams() {
  const entries = await ComponentsCollection.getEntries({ recursive: true })

  return entries.map((entry) => ({
    slug: entry.getPathnameSegments({ includeBasePathname: false }),
  }))
}

export default async function Component({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const slug = (await params).slug
  const componentEntry = await ComponentsCollection.getFile(slug, ['ts', 'tsx'])
  const mdxFile = await ComponentsCollection.getFile(slug, 'mdx').catch(
    (error) => {
      if (error instanceof FileNotFoundError) {
        return undefined
      }
      throw error
    }
  )
  const mdxHeadings = await mdxFile
    ?.getExportValue('headings')
    .catch((error) => {
      if (error instanceof FileExportNotFoundError) {
        return undefined
      }
      throw error
    })
  const Content = await mdxFile?.getExportValue('default')
  const mainExport = await componentEntry
    .getExport<any>(componentEntry.getBaseName())
    .catch((error) => {
      if (error instanceof FileExportNotFoundError) {
        return undefined
      }
      throw error
    })
  const description = mainExport ? mainExport.getDescription() : null
  const examplesEntry = await ComponentsCollection.getEntry([
    ...slug,
    'examples',
  ]).catch((error) => {
    if (error instanceof FileNotFoundError) {
      return undefined
    }
    throw error
  })
  let exampleFiles: JavaScriptFile<any>[] | null = null

  if (isDirectory(examplesEntry)) {
    exampleFiles = await examplesEntry
      .getEntries({
        includeIndexAndReadmeFiles: true,
        includeTsConfigExcludedFiles: true,
      })
      .then((entries) => entries.filter((entry) => isFile(entry, 'tsx')))
  } else if (isFile(examplesEntry, 'tsx')) {
    exampleFiles = [examplesEntry]
  }

  const examplesExports = exampleFiles
    ? (
        await Promise.all(exampleFiles.map(async (file) => file.getExports()))
      ).flat()
    : []
  const isExamplesPage = slug.at(-1) === 'examples'
  const componentExports = isExamplesPage
    ? undefined
    : await componentEntry.getExports()
  const updatedAt = await componentEntry.getLastCommitDate()
  const url = componentEntry.getEditUrl()
  const [previousEntry, nextEntry] = await componentEntry.getSiblings({
    entryGroup: CollectionGroup,
  })

  let headings: MDXHeadings = []

  if (mdxHeadings) {
    headings.push(...(mdxHeadings as MDXHeadings))
  }

  if (examplesExports.length) {
    const parsedExports = examplesExports.map((exampleExport) => ({
      level: 3,
      id: exampleExport.getSlug(),
      children: exampleExport.getTitle(),
      text: exampleExport.getTitle(),
    }))

    headings.push(
      {
        level: 2,
        id: 'examples',
        children: 'Examples',
        text: 'Examples',
      },
      ...parsedExports
    )
  }

  if (componentExports) {
    headings.push(
      {
        level: 2,
        id: 'api-reference',
        children: 'API Reference',
        text: 'API Reference',
      },
      ...componentExports.map((componentExport) => ({
        level: 3,
        id: componentExport.getSlug(),
        children: componentExport.getName(),
        text: componentExport.getName(),
      }))
    )
  }

  const baseName = componentEntry.getBaseName()
  // If base name is kebab case, use the first export name as the title
  const title = baseName.includes('-')
    ? componentExports?.length
      ? componentExports[0].getName()
      : baseName
    : baseName

  return (
    <>
      <div css={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
        <div css={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {description || Content ? (
            <div className="prose">
              <h1 css={{ fontSize: '3rem', margin: 0 }}>
                {title} {isExamplesPage ? 'Examples' : ''}
              </h1>
              {description ? <MDX>{description}</MDX> : null}
              {Content ? <Content /> : null}
            </div>
          ) : (
            <h1 css={{ fontSize: '3rem', margin: 0 }}>
              {title} {isExamplesPage ? 'Examples' : ''}
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
                  <Preview fileExport={fileExport} />
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

      <TableOfContents headings={headings} editPath={url} />
    </>
  )
}

async function Preview({
  fileExport,
}: {
  fileExport: JavaScriptFileExport<React.ComponentType>
}) {
  const name = fileExport.getName()
  const title = fileExport.getTitle()
  const description = fileExport.getDescription()
  const slug = fileExport.getSlug()
  const url = fileExport.getEditUrl()
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
          <a href={url} css={{ fontSize: 'var(--font-size-body-3)' }}>
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
        <CodeBlock language="tsx">
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
            <Tokens>{fileExport.getText({ includeDependencies: true })}</Tokens>
          </pre>
        </CodeBlock>
      </div>
    </section>
  )
}
