import { notFound } from 'next/navigation'

import { GuidesCollection } from '@/collections'
import { DocumentSource } from '@/components/DocumentSource'

export default async function Doc() {
  const docSource = await GuidesCollection.getSource()

  if (!docSource) {
    notFound()
  }

  return (
    <DocumentSource
      source={docSource}
      shouldRenderTableOfContents={false}
      shouldRenderUpdatedAt={false}
    />
  )
}
