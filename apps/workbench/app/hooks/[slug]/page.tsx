import { CodeBlock, isDirectory, Link } from 'renoun'
import { notFound } from 'next/navigation'

import { HooksDirectory, RootCollection } from '@/collections'
import { EntryLayout } from '@/ui/EntryLayout'
import { Reference } from '@/ui/Reference'

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
    hookEntry.baseName.toLowerCase()
  )
    ? parentDirectory.baseName
    : hookEntry.baseName
  const [previousEntry, nextEntry] = await hookEntry.getSiblings({
    collection: RootCollection,
  })
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
    <EntryLayout
      header={
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="mt-0!">{title}</h1>
        </div>
      }
      footer={
        <Link
          source={hookEntry}
          variant={process.env.NODE_ENV === 'development' ? 'editor' : 'edit'}
          className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
        >
          View source
        </Link>
      }
      lastUpdated={lastCommitDate}
      previousEntry={previousEntry}
      nextEntry={nextEntry}
    >
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
                    components={{
                      Container: {
                        style: {
                          margin: 0,
                          borderRadius: 0,
                          boxShadow: undefined,
                          padding: '1rem',
                        },
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
    </EntryLayout>
  )
}
