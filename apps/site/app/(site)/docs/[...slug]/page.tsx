import { notFound } from 'next/navigation'

import { CollectionGroup, DocsCollection } from '@/collections'
import { DocumentEntry } from '@/components/DocumentEntry'

export async function generateStaticParams() {
  const entries = await DocsCollection.getEntries()

  return entries.map((entry) => ({
    slug: entry.getPathSegments({ includeBasePath: false }),
  }))
}

export default async function Doc({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const file = await CollectionGroup.getFile(['docs', ...(await params).slug])
  const hasEntry = await DocsCollection.getHasEntry(file)

  if (!hasEntry(file)) {
    notFound()
  }

  return <DocumentEntry file={file} />
}
