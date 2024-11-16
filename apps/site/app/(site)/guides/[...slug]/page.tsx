import { notFound } from 'next/navigation'

import { AllCollections, GuidesCollection } from '@/collections'
import { DocumentSource } from '@/components/DocumentSource'

export async function generateStaticParams() {
  const sources = await GuidesCollection.getSources()
  return sources.map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Doc({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const docSource = await AllCollections.getSource([
    'guides',
    ...(await params).slug,
  ])

  if (!GuidesCollection.hasSource(docSource)) {
    notFound()
  }

  return <DocumentSource source={docSource} />
}
