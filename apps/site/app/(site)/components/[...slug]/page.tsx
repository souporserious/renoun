import {
  isFile,
  isDirectory,
  FileNotFoundError,
  ModuleExportNotFoundError,
  type JavaScriptFile,
  type JavaScriptModuleExport,
  type MDXHeadings,
  Link,
} from 'renoun'

import { RootCollection, ComponentsDirectory } from '@/collections'
import { CodePreview } from '@/components/CodePreview'
import { MDX } from '@/components/MDX'
import { References } from '@/components/Reference'
import { SiblingLink } from '@/components/SiblingLink'
import { TableOfContents } from '@/components/TableOfContents'

export async function generateStaticParams() {
  const entries = await ComponentsDirectory.getEntries({ recursive: true })

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
  const componentEntry = await ComponentsDirectory.getFile(slug, ['ts', 'tsx'])
  const mdxFile = await ComponentsDirectory.getFile(slug, 'mdx').catch(
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
      if (error instanceof ModuleExportNotFoundError) {
        return undefined
      }
      throw error
    })
  const Content = await mdxFile?.getExportValue('default')
  const mainExport = await componentEntry
    .getExport<any>(componentEntry.getBaseName())
    .catch((error) => {
      if (error instanceof ModuleExportNotFoundError) {
        return undefined
      }
      throw error
    })
  const description = mainExport ? mainExport.getDescription() : null
  const examplesEntry = await ComponentsDirectory.getEntry([
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

  // Fallback look for co-located *.examples.tsx inside the component directory
  if (!exampleFiles || exampleFiles.length === 0) {
    try {
      const componentDir = await ComponentsDirectory.getDirectory(slug)
      const entries = await componentDir.getEntries({
        includeIndexAndReadmeFiles: true,
        includeTsConfigExcludedFiles: true,
      })
      exampleFiles = entries.filter(
        (entry): entry is JavaScriptFile<any> =>
          isFile(entry, 'tsx') && entry.getModifierName() === 'examples'
      )
    } catch {
      // If no directory exists for this slug, there are no co-located examples
    }
  }

  const allExamplesExports = exampleFiles
    ? (
        await Promise.all(exampleFiles.map(async (file) => file.getExports()))
      ).flat()
    : []
  // Optionally pick up a co-located layout/default export from a *.examples file
  const layoutCandidate = exampleFiles?.find(
    (file) => file.getModifierName() === 'examples'
  )
  const layoutExport = layoutCandidate
    ? await layoutCandidate.getExport('default').catch((error) => {
        if (error instanceof ModuleExportNotFoundError) {
          return undefined
        }
        throw error
      })
    : undefined
  // Exclude the layout's default export from example rendering
  const filteredExamples = layoutExport
    ? allExamplesExports.filter((exp) => exp !== layoutExport)
    : allExamplesExports
  const [heroExport, ...examplesExports] = filteredExamples
  const isExamplesPage = slug.at(-1) === 'examples'
  const componentExports = isExamplesPage
    ? undefined
    : await componentEntry.getExports()
  const updatedAt = await componentEntry.getLastCommitDate()
  const [previousEntry, nextEntry] = await componentEntry.getSiblings({
    collection: RootCollection,
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
        id: componentExport.getName(),
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
              {heroExport ? (
                <CodePreview
                  fileExport={heroExport}
                  layoutExport={layoutExport}
                  fullBleed
                />
              ) : null}
              {Content ? <Content /> : null}
            </div>
          ) : (
            <>
              <h1 css={{ fontSize: '3rem', margin: 0 }}>
                {title} {isExamplesPage ? 'Examples' : ''}
              </h1>
              {heroExport ? (
                <CodePreview
                  fileExport={heroExport}
                  layoutExport={layoutExport}
                  fullBleed
                />
              ) : null}
            </>
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
                    fileExport={fileExport}
                    layoutExport={layoutExport}
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
            <References fileExports={componentExports} />
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
                css={{ fontWeight: 'var(--font-weight-strong)' }}
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
                  ComponentsDirectory.hasEntry(previousEntry) ? 'name' : 'title'
                }
              />
            ) : null}
            {nextEntry ? (
              <SiblingLink
                entry={nextEntry}
                direction="next"
                variant={
                  ComponentsDirectory.hasEntry(nextEntry) ? 'name' : 'title'
                }
              />
            ) : null}
          </nav>
        </div>
      </div>

      <TableOfContents headings={headings} entry={componentEntry} />
    </>
  )
}

async function Preview({
  fileExport,
  layoutExport,
}: {
  fileExport: JavaScriptModuleExport<React.ComponentType>
  layoutExport?: JavaScriptModuleExport<any>
}) {
  const title = fileExport.getTitle()
  const description = fileExport.getDescription()
  return (
    <CodePreview
      fileExport={fileExport}
      layoutExport={layoutExport}
      header={
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
            <Link source={fileExport} variant="edit">
              {(href) => <a href={href}>View Source</a>}
            </Link>
          </div>
          {description ? <p>{description}</p> : null}
        </header>
      }
    />
  )
}
