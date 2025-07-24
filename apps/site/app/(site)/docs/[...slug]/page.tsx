import { RootCollection, DocsDirectory } from '@/collections'
import { DocumentEntry } from '@/components/DocumentEntry'

export async function generateStaticParams() {
  const entries = await DocsDirectory.getEntries()

  return entries.map((entry) => ({
    slug: entry.getPathnameSegments({ includeBasePathname: false }),
  }))
}

export default async function Doc({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const file = await DocsDirectory.getFile(slug, 'mdx')

  return <DocumentEntry file={file} collection={RootCollection} />
}
