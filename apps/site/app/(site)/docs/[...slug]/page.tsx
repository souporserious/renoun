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
  const file = await DocsCollection.getFile(
    ['docs', ...(await params).slug],
    'mdx'
  )

  if (!file) {
    notFound()
  }

  return <DocumentEntry file={file} entryGroup={CollectionGroup} />
}
