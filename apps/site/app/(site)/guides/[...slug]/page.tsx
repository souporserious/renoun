import { notFound } from 'next/navigation'

import { GuidesCollection } from '@/collections'
import { DocumentSource } from '@/components/DocumentSource'

export async function generateStaticParams() {
  const sources = await GuidesCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Doc({ params }: { params: { slug: string[] } }) {
  const docSource = GuidesCollection.getSource(['guides', ...params.slug])

  if (!docSource) {
    notFound()
  }

  return <DocumentSource source={docSource} />
}
