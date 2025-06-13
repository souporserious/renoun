import {
  isFile,
  isDirectory,
  FileNotFoundError,
  type MDXFile,
  type FileSystemEntry,
} from 'renoun/file-system'

/** Attempt to get the title of an entry. */
export async function getEntryTitle(entry: FileSystemEntry<any>) {
  if (isFile(entry, 'mdx')) {
    return getMetadataTitle(entry)
  } else if (isDirectory(entry)) {
    return entry
      .getFile('readme', 'mdx')
      .then(getMetadataTitle)
      .catch(async (error) => {
        if (error instanceof FileNotFoundError) {
          return entry.getFile('index', 'mdx').then(getMetadataTitle)
        }
        throw error
      })
  } else {
    throw new Error(`Invalid entry type for ${entry.getPathname()}`)
  }
}

async function getMetadataTitle(
  entry: MDXFile<{ metadata: { title: string } }>
) {
  const metadata = await entry.getExportValue('metadata')
  return metadata.title
}
