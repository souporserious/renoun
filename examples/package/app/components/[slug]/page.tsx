import {
  Reference,
  isFile,
  isDirectory,
  FileNotFoundError,
  Link,
  type FileSystemEntry,
  type JavaScriptModuleExport,
} from 'renoun'
import NextLink from 'next/link'
import { notFound } from 'next/navigation'

import { ComponentsCollection } from '@/collections'
import { Stack } from '@/components'

export async function generateStaticParams() {
  const entries = await ComponentsCollection.getEntries()
  return entries.map((entry) => ({ slug: entry.getSlug() }))
}

export default async function Component(
  props: PageProps<'/components/[slug]'>
) {
  const { slug } = await props.params
  const componentEntry = await ComponentsCollection.getEntry(slug)

  if (!componentEntry) {
    notFound()
  }

  const componentDirectory = isDirectory(componentEntry)
    ? componentEntry
    : componentEntry.getParent()
  const mainEntry = await componentDirectory
    .getFile(slug, ['ts', 'tsx'])
    .catch((error) => {
      if (error instanceof FileNotFoundError) {
        return componentDirectory
          .getFile('index', ['ts', 'tsx'])
          .catch((error) => {
            if (error instanceof FileNotFoundError) {
              return undefined
            }
            throw error
          })
      }
      throw error
    })
  const examplesEntry = await componentDirectory
    .getEntry('examples')
    .catch((error) => {
      if (error instanceof FileNotFoundError) {
        return undefined
      }
      throw error
    })
  const exampleFiles = examplesEntry
    ? isDirectory(examplesEntry)
      ? (await examplesEntry.getEntries()).filter((entry) =>
          isFile(entry, 'tsx')
        )
      : isFile(examplesEntry, 'tsx')
        ? [examplesEntry]
        : null
    : null
  const readmeFile = await componentDirectory.getFile('readme', 'mdx')
  const Readme = await readmeFile.getExportValue('default')
  const lastCommitDate = await componentEntry.getLastCommitDate()
  const parentDirectory = componentEntry.getParent()
  const title = ['index', 'readme'].includes(
    componentEntry.getBaseName().toLowerCase()
  )
    ? parentDirectory.getBaseName()
    : componentEntry.getBaseName()
  const [previousEntry, nextEntry] = await parentDirectory.getSiblings()

  return (
    <div className="flex flex-col gap-12">
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <h1 className="!mt-0">{title}</h1>
        {Readme ? <Readme /> : null}
      </div>

      {mainEntry ? (
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h2>API Reference</h2>
          <Reference source={mainEntry} />
        </div>
      ) : null}

      {exampleFiles ? (
        <div>
          <h2 className="text-xl font-semibold mb-6">Examples</h2>
          <ul className="list-none p-0 m-0 grid gap-6">
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
      ) : null}

      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <div className="grid grid-cols-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
          {lastCommitDate ? (
            <div className="text-left">
              Last updated{' '}
              <time
                dateTime={lastCommitDate.toISOString()}
                itemProp="dateModified"
                className="font-semibold"
              >
                {lastCommitDate.toLocaleString('en', {
                  year: '2-digit',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </time>
            </div>
          ) : null}

          <div className="text-right">
            <Link
              source={componentEntry}
              variant={
                process.env.NODE_ENV === 'development'
                  ? 'editor'
                  : isDirectory(componentEntry)
                    ? 'source'
                    : 'edit'
              }
            >
              Edit this page
            </Link>
          </div>
        </div>

        <nav className="grid grid-cols-2 px-4 py-2">
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
  fileExport: JavaScriptModuleExport<any>
}) {
  const name = fileExport.getName()
  const description = fileExport.getDescription()
  const Value = await fileExport.getRuntimeValue()
  const isUppercase = name[0] === name[0].toUpperCase()
  const isComponent = typeof Value === 'function' && isUppercase

  return (
    <section key={name} className="flex flex-col gap-3">
      <header>
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-lg font-semibold flex-1">{name}</h3>
          <Link
            source={fileExport}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="View source"
            title="View source"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
            </svg>
          </Link>
        </div>
        {description ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 m-0">
            {description}
          </p>
        ) : null}
      </header>

      <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isComponent ? (
          <div className="p-8 overflow-auto">
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
    <NextLink
      href={entry.getPathname()}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {entry.getBaseName()}
    </NextLink>
  )
}
