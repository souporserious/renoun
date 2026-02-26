import { cache } from 'react'
import type { Collection, FileSystemEntry, MDXFile } from 'renoun'

import { TableOfContents } from '@/components/TableOfContents'
import { SiblingLink } from './SiblingLink'

const getCollectionEntriesForSiblings = cache(
  async (collection: Collection<any>): Promise<FileSystemEntry<any>[]> =>
    collection.getEntries({ recursive: true })
)

async function getSiblings(
  file: MDXFile<any>,
  collection?: Collection<any>
): Promise<[FileSystemEntry<any> | undefined, FileSystemEntry<any> | undefined]> {
  if (!collection || process.env.NODE_ENV !== 'production') {
    return file.getSiblings({ collection })
  }

  const isIndexOrReadme = ['index', 'readme'].includes(
    file.baseName.toLowerCase()
  )
  if (isIndexOrReadme) {
    return file.getSiblings()
  }

  const entries = await getCollectionEntriesForSiblings(collection)
  const path = file.getPathname()
  const index = entries.findIndex((entry) => entry.getPathname() === path)
  if (index === -1) {
    return file.getSiblings({ collection })
  }

  const previousEntry = index > 0 ? entries[index - 1] : undefined
  const nextEntry = index < entries.length - 1 ? entries[index + 1] : undefined

  return [previousEntry, nextEntry]
}

export async function DocumentEntry({
  file,
  collection,
  shouldRenderTableOfContents = true,
  shouldRenderUpdatedAt = true,
}: {
  file: MDXFile<{
    metadata: {
      title: string
      description: string
    }
  }>
  collection?: Collection<any>
  shouldRenderTableOfContents?: boolean
  shouldRenderUpdatedAt?: boolean
}) {
  const contentPromise = file.getContent()
  const sectionsPromise = file.getSections()
  const metadataPromise = file.getExportValue('metadata')
  const siblingsPromise = getSiblings(file, collection)
  const updatedAtPromise = shouldRenderUpdatedAt
    ? file.getLastCommitDate()
    : Promise.resolve<Date | null>(null)

  const [Content, sections, metadata, siblingEntries, updatedAt] =
    await Promise.all([
      contentPromise,
      sectionsPromise,
      metadataPromise,
      siblingsPromise,
      updatedAtPromise,
    ])
  let [previousEntry, nextEntry] = siblingEntries

  if (previousEntry?.baseName === 'docs') {
    previousEntry = undefined
  }

  return (
    <>
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4rem',
        }}
      >
        <div className="prose">
          <h1 css={{ fontSize: '3rem', margin: 0 }}>{metadata.title}</h1>
          {metadata.description ? <p>{metadata.description}</p> : null}
          <Content />
        </div>

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
            css={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2rem',
            }}
          >
            {previousEntry ? (
              <SiblingLink
                entry={previousEntry}
                direction="previous"
                variant="title"
              />
            ) : null}
            {nextEntry ? (
              <SiblingLink
                entry={nextEntry}
                direction="next"
                variant="title"
              />
            ) : null}
          </nav>
        </div>
      </div>

      {shouldRenderTableOfContents ? (
        <TableOfContents sections={sections} entry={file} />
      ) : null}
    </>
  )
}
