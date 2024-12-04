import { notFound } from 'next/navigation'

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
  const file = await CollectionGroup.getFile(['guides', ...(await params).slug])

  if (!GuidesCollection.hasEntry(file)) {
    notFound()
  }

  return <DocumentEntry file={file} />
}
