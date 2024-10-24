import { notFound } from 'next/navigation'

import { CollectionsDocsCollection } from '@/collections'
import { DocumentSource } from '@/components/DocumentSource'

export async function generateStaticParams() {
  const sources = await CollectionsDocsCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Document({
  params,
}: {
  params: { slug: string[] }
}) {
  const source = await CollectionsDocsCollection.getSource(params.slug)

  if (!source) {
    notFound()
  }

  return <DocumentSource source={source} />
}
