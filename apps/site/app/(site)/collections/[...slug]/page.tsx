import { createCollection, type MDXContent } from 'renoun/collections'
import type { Headings } from '@renoun/mdx'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { DocumentSource } from '@/components/DocumentSource'

const DocsCollection = createCollection<{
  default: MDXContent
  metadata: { title: string; description: string }
  headings: Headings
}>('app/[(]site[)]/collections/docs/*.mdx', {
  baseDirectory: 'app/(site)/collections/docs',
  schema: {
    metadata: z.object({
      title: z.string(),
      description: z.string(),
    }).parse,
  },
})

export async function generateStaticParams() {
  const sources = await DocsCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Doc({ params }: { params: { slug: string[] } }) {
  const docSource = DocsCollection.getSource(params.slug)

  if (!docSource) {
    notFound()
  }

  return <DocumentSource source={docSource} />
}
