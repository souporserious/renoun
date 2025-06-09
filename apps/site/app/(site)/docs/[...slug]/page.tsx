import { CollectionGroup, DocsCollection } from '@/collections'
import { DocumentEntry } from '@/components/DocumentEntry'

export async function generateStaticParams() {
  const entries = await DocsCollection.getEntries()

  return entries.map((entry) => ({
    slug: entry.getRouteSegments({ includeBasePath: false }),
  }))
}

export default async function Doc({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const file = await DocsCollection.getFile(slug, 'mdx')

  return <DocumentEntry file={file} entryGroup={CollectionGroup} />
}
