import { notFound } from 'next/navigation'

import { AllCollections, DocsCollection } from '@/collections'
import { DocumentSource } from '@/components/DocumentSource'

export async function generateStaticParams() {
  const sources = await DocsCollection.getSources()
  return sources.map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Doc({ params }: { params: { slug: string[] } }) {
  const docSource = await AllCollections.getSource(['docs', ...params.slug])

  if (!DocsCollection.hasSource(docSource)) {
    notFound()
  }

  return <DocumentSource source={docSource} />
}
