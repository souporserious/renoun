import { CollectionGroup, GuidesCollection } from '@/collections'
import { DocumentEntry } from '@/components/DocumentEntry'

export async function generateStaticParams() {
  const entries = await GuidesCollection.getEntries()

  return entries.map((entry) => ({
    slug: entry.getPathSegments({ includeBasePath: false }),
  }))
}

export default async function Guide({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const file = await GuidesCollection.getFileOrThrow((await params).slug, 'mdx')

  return <DocumentEntry file={file} entryGroup={CollectionGroup} />
}
