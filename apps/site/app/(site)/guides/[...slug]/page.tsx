import { notFound } from 'next/navigation'

import { AllCollections, GuidesCollection } from '@/collections'
import { DocumentSource } from '@/components/DocumentSource'

export async function generateStaticParams() {
  const sources = await GuidesCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Doc({ params }: { params: { slug: string[] } }) {
  const docSource = await AllCollections.getSource(['guides', ...params.slug])

  if (!GuidesCollection.hasSource(docSource)) {
    notFound()
  }

  return <DocumentSource source={docSource} />
}
