import { APIReference } from 'renoun/components'
import {
  isFile,
  isDirectory,
  type FileSystemEntry,
  type JavaScriptFileExport,
} from 'renoun/file-system'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ComponentsCollection } from '@/collections'
import { Stack } from '@/components'

export async function generateStaticParams() {
  const entries = await ComponentsCollection.getEntries()
  return entries.map((entry) => ({ slug: entry.getSlug() }))
}

export default async function Component({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug
  const componentEntry = await ComponentsCollection.getEntry(slug)

  if (!componentEntry) {
    notFound()
  }

  const componentDirectory = isDirectory(componentEntry)
    ? componentEntry
    : componentEntry.getParent()
  const mainEntry =
    (await componentDirectory.getFile(slug, ['ts', 'tsx'])) ||
    (await componentDirectory.getFile('index', ['ts', 'tsx']))
  const examplesEntry = await componentDirectory.getEntry('examples')
  const exampleFiles = examplesEntry
    ? isDirectory(examplesEntry)
      ? await examplesEntry.getEntries()
      : isFile(examplesEntry, 'tsx')
        ? [examplesEntry]
        : null
    : null
  const isExamplesPage = slug.at(-1) === 'examples'
  const readmeFile = await componentDirectory.getFileOrThrow('readme', 'mdx')
  const Readme = await readmeFile.getExportValue('default')
  const lastCommitDate = await componentEntry.getLastCommitDate()
  const editUrl =
    process.env.NODE_ENV === 'development'
      ? componentEntry.getEditorUri()
      : isDirectory(componentEntry)
        ? componentEntry.getSourceUrl()
        : componentEntry.getEditUrl()
  const [previousEntry, nextEntry] = await componentEntry.getSiblings()

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '4rem 0',
        gap: '4rem',
      }}
    >
      <div>
        <h1>{componentEntry.getName()}</h1>
        {Readme ? <Readme /> : null}
      </div>

      {mainEntry ? (
        <div>
          <h2>API Reference</h2>
          <APIReference source={mainEntry} />
        </div>
      ) : null}

      {/* {isExamplesPage || !exampleFiles ? null : (
        <div>
          <h2 css={{ margin: '0 0 2rem' }}>Examples</h2>
          <ul
            css={{
              listStyle: 'none',
              display: 'grid',
              padding: 0,
              margin: 0,
              gap: '2rem',
            }}
          >
            {exampleFiles.map(async (file) => {
              const fileExports = await file.getExports()

              return fileExports.map((fileExport) => {
                return (
                  <li key={fileExport.getName()}>
                    <Preview fileExport={fileExport} />
                  </li>
                )
              })
            })}
          </ul>
        </div>
      )} */}

      <div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            padding: '1rem',
          }}
        >
          {lastCommitDate ? (
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
                dateTime={lastCommitDate.toISOString()}
                itemProp="dateModified"
                style={{ fontWeight: 600 }}
              >
                {lastCommitDate.toLocaleString('en', {
                  year: '2-digit',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </time>
            </div>
          ) : null}

          {editUrl ? (
            <a href={editUrl} style={{ gridColumn: 2, textAlign: 'right' }}>
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
          {previousEntry ? (
            <SiblingLink entry={previousEntry} direction="previous" />
          ) : null}
          {nextEntry ? (
            <SiblingLink entry={nextEntry} direction="next" />
          ) : null}
        </nav>
      </div>
    </div>
  )
}

async function Preview({
  fileExport,
}: {
  fileExport: JavaScriptFileExport<any>
}) {
  const name = fileExport.getName()
  const description = fileExport.getDescription()
  const url = fileExport.getSourceUrl()
  const Value = await fileExport.getRuntimeValue()
  const isUppercase = name[0] === name[0].toUpperCase()
  const isComponent = typeof Value === 'function' && isUppercase

  return (
    <section key={name}>
      <header>
        <Stack flexDirection="row" alignItems="baseline" gap="0.5rem">
          <h3 css={{ margin: 0 }}>{name}</h3> <a href={url}>Edit example</a>
        </Stack>
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
      </div>
    </section>
  )
}

async function SiblingLink({
  entry,
  direction,
}: {
  entry: FileSystemEntry<any>
  direction: 'previous' | 'next'
}) {
  return (
    <Link
      href={entry.getPath()}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {entry.getName()}
    </Link>
  )
}
