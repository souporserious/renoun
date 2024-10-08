import { notFound } from 'next/navigation'

import { AllCollections, DocsCollection } from '@/collections'
import { DocumentSource } from '@/components/DocumentSource'

export async function generateStaticParams() {
  const sources = await DocsCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Doc({ params }: { params: { slug: string[] } }) {
  const docSource = AllCollections.getSource(['docs', ...params.slug])

  if (!DocsCollection.hasSource(docSource)) {
    notFound()
  }

  return <DocumentSource source={docSource} />
}
