import { APIReference } from 'renoun/components'
import {
  isFileWithExtension,
  isDirectory,
  type JavaScriptFileExport,
} from 'renoun/file-system'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ComponentsCollection, type ComponentEntry } from '@/collections'
import { Stack } from '@/components'

export async function generateStaticParams() {
  const entries = await ComponentsCollection.getEntries()
  return entries.map((entry) => ({ slug: entry.getName() }))
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
    : componentEntry.getDirectory()
  const mainEntry =
    (await componentDirectory.getFile(slug, ['ts', 'tsx'])) ||
    (await componentDirectory.getFile('index', ['ts', 'tsx']))
  const examplesEntry = await componentDirectory.getEntry('examples')
  const exampleFiles = examplesEntry
    ? isDirectory(examplesEntry)
      ? await examplesEntry
          .filter((entry) => isFileWithExtension(entry, 'tsx'))
          .getEntries()
      : isFileWithExtension(examplesEntry, 'tsx')
        ? [examplesEntry]
        : null
    : null
  const isExamplesPage = slug.at(-1) === 'examples'
  const readmeFile = await componentDirectory.getFileOrThrow('README', 'mdx')
  const Readme = await readmeFile.getExport('default').getRuntimeValue()
  const updatedAt = await componentEntry.getUpdatedAt()
  const editPath = componentEntry.getEditPath()
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

      {isExamplesPage || !exampleFiles ? null : (
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

              return Promise.all(
                fileExports.map(async (fileExport) => {
                  const exportName = await fileExport.getName()
                  return (
                    <li key={exportName}>
                      <Preview fileExport={fileExport} />
                    </li>
                  )
                })
              )
            })}
          </ul>
        </div>
      )}

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
            <a href={editPath} style={{ gridColumn: 2, textAlign: 'right' }}>
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
  fileExport: JavaScriptFileExport<React.ComponentType>
}) {
  const name = await fileExport.getName()
  const description = await fileExport.getDescription()
  const editPath = fileExport.getEditPath()
  const Value = await fileExport.getRuntimeValue()
  const isUppercase = name[0] === name[0].toUpperCase()
  const isComponent = typeof Value === 'function' && isUppercase

  return (
    <section key={name}>
      <header>
        <Stack flexDirection="row" alignItems="baseline" gap="0.5rem">
          <h3 css={{ margin: 0 }}>{name}</h3>{' '}
          <a href={editPath}>Edit example</a>
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
  entry: ComponentEntry
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
