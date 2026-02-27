import { cache } from 'react'
import type { Collection, FileSystemEntry, MDXFile } from 'renoun'

const getCollectionEntriesForSiblings = cache(
  async (collection: Collection<any>): Promise<FileSystemEntry<any>[]> =>
    collection.getEntries({ recursive: true })
)

export async function getDocumentEntrySiblings(
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
    return file.getSiblings({ collection })
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
