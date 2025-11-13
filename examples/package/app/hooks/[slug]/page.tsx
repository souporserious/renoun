import { CodeBlock, isDirectory, Link, type FileSystemEntry } from 'renoun'
import NextLink from 'next/link'
import { notFound } from 'next/navigation'

import { HooksDirectory } from '@/collections'
import { Reference } from '@/components'

export async function generateStaticParams() {
  const entries = await HooksDirectory.getEntries()
  return entries.map((entry) => ({ slug: entry.getSlug() }))
}

export default async function HookPage(props: PageProps<'/hooks/[slug]'>) {
  const { slug } = await props.params
  const hookEntry = await HooksDirectory.getEntry(slug)

  if (!hookEntry) {
    notFound()
  }

  const hookDirectory = isDirectory(hookEntry)
    ? hookEntry
    : hookEntry.getParent()
  const mainEntry = await hookDirectory
    .getFile(slug, 'ts')
    .catch(() => undefined)
  const lastCommitDate = await hookEntry.getLastCommitDate()
  const parentDirectory = hookEntry.getParent()
  const title = ['index', 'readme'].includes(
    hookEntry.getBaseName().toLowerCase()
  )
    ? parentDirectory.getBaseName()
    : hookEntry.getBaseName()
  const [previousEntry, nextEntry] = await parentDirectory.getSiblings()
  const fileExports = mainEntry ? await mainEntry.getExports() : []
  const exampleTags = fileExports
    .map((example) => ({
      name: example.getName(),
      tags: example.getTags() ?? [],
    }))
    .flatMap(({ name, tags }) =>
      tags
        .filter((tag) => tag.name === 'example' && tag.text && tag.text.trim())
        .map((tag) => ({ exportName: name, text: tag.text }))
    )

  return (
    <div className="flex flex-col gap-12">
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <h1 className="!mt-0">{title}</h1>
      </div>

      {mainEntry ? (
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h2>API Reference</h2>
          <Reference source={mainEntry} />
        </div>
      ) : null}

      {exampleTags.length > 0 ? (
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h2>Examples</h2>
          <ul className="not-prose list-none p-0 m-0 grid gap-6">
            {exampleTags.map((example, index) => (
              <li key={`${example.exportName}-${index}`}>
                <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                    {example.exportName}
                  </div>
                  <CodeBlock
                    language="tsx"
                    css={{
                      container: {
                        margin: 0,
                        borderRadius: 0,
                        boxShadow: undefined,
                        padding: '1rem',
                      },
                    }}
                  >
                    {example.text}
                  </CodeBlock>
                </div>
              </li>
            ))}
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
            <Link source={hookEntry} variant="source">
              View source
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
      className={direction === 'previous' ? 'text-left' : 'text-right'}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {entry.getBaseName()}
    </NextLink>
  )
}
