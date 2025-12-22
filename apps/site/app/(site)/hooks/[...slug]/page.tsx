import {
  isFile,
  isDirectory,
  FileNotFoundError,
  ModuleExportNotFoundError,
  Link,
  type JavaScriptFile,
  type ModuleExport,
  type TableOfContentsSection,
} from 'renoun'

import { RootCollection, HooksDirectory } from '@/collections'
import { CodePreview } from '@/components/CodePreview'
import { MDX } from '@/components/MDX'
import { References } from '@/components/Reference'
import { SiblingLink } from '@/components/SiblingLink'
import { TableOfContents } from '@/components/TableOfContents'

export async function generateStaticParams() {
  const entries = await HooksDirectory.getEntries({ recursive: true })

  return entries.map((entry) => ({
    slug: entry.getPathnameSegments({ includeBasePathname: false }),
  }))
}

export default async function Hook(props: PageProps<'/hooks/[...slug]'>) {
  const { slug } = await props.params
  const hookEntry = await HooksDirectory.getFile(slug, ['ts', 'tsx'])
  const mdxFile = await HooksDirectory.getFile(slug, 'mdx').catch((error) => {
    if (error instanceof FileNotFoundError) {
      return undefined
    }
    throw error
  })
  const mdxSections = await mdxFile?.getSections().catch((error) => {
    if (error instanceof ModuleExportNotFoundError) {
      return undefined
    }
    throw error
  })
  const Content = await mdxFile?.getExportValue('default')
  const mainExport = await hookEntry
    .getExport<any>(hookEntry.getBaseName())
    .catch((error) => {
      if (error instanceof ModuleExportNotFoundError) {
        return undefined
      }
      throw error
    })
  const description = mainExport ? mainExport.getDescription() : null
  const examplesEntry = await HooksDirectory.getEntry([
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
  const hookExports = isExamplesPage ? undefined : await hookEntry.getExports()
  const hookSections = isExamplesPage ? [] : await hookEntry.getSections()
  const updatedAt = await hookEntry.getLastCommitDate()
  const [previousEntry, nextEntry] = await hookEntry.getSiblings({
    collection: RootCollection,
  })

  let sections: TableOfContentsSection[] = []

  if (mdxSections) {
    sections.push(...mdxSections)
  }

  if (examplesExports.length) {
    const parsedExports: TableOfContentsSection[] = examplesExports.map(
      (exampleExport) => ({
        id: exampleExport.getSlug(),
        title: exampleExport.getTitle(),
      })
    )

    sections.push({
      id: 'examples',
      title: 'Examples',
      children: parsedExports,
    })
  }

  if (hookSections.length) {
    sections.push({
      id: 'api-reference',
      title: 'API Reference',
      children: hookSections,
    })
  }

  const baseName = hookEntry.getBaseName()
  const title = baseName.includes('-')
    ? hookExports?.length
      ? hookExports[0].getName()
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

        {hookExports ? (
          <div>
            <h2 id="api-reference" css={{ margin: '0 0 2rem' }}>
              API Reference
            </h2>
            <References fileExports={hookExports} />
          </div>
        ) : null}

        <div css={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {updatedAt ? (
            <div
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                fontSize: 'var(--font-size-body-3)',
                color: 'var(--color-foreground-secondary)',
              }}
            >
              <span suppressHydrationWarning>
                Last updated: {updatedAt.toLocaleDateString()}
              </span>
              <Link source={hookEntry} variant="edit">
                {({ href }) => (
                  <a
                    href={href}
                    css={{
                      color: 'var(--color-foreground-interactive)',
                      textDecoration: 'none',
                    }}
                  >
                    Edit on GitHub
                  </a>
                )}
              </Link>
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
                variant={isDirectory(previousEntry) ? 'title' : 'name'}
              />
            ) : null}
            {nextEntry ? (
              <SiblingLink
                entry={nextEntry}
                direction="next"
                variant={isDirectory(nextEntry) ? 'title' : 'name'}
              />
            ) : null}
          </nav>
        </div>
      </div>

      <TableOfContents sections={sections} />
    </>
  )
}

async function Preview({
  fileExport,
}: {
  fileExport: ModuleExport<React.ComponentType>
}) {
  const title = fileExport.getTitle()
  const description = fileExport.getDescription()
  return (
    <CodePreview
      fileExport={fileExport}
      header={
        <header css={{ marginBottom: '1rem' }}>
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
            <Link source={fileExport} variant="edit">
              {({ href }) => (
                <a href={href} css={{ fontSize: 'var(--font-size-body-3)' }}>
                  View Source
                </a>
              )}
            </Link>
          </div>
          {description ? <p>{description}</p> : null}
        </header>
      }
    />
  )
}
