import { RootCollection, GuidesDirectory } from '@/collections'
import { DocumentEntry } from '@/components/DocumentEntry'

export async function generateStaticParams() {
  const entries = await GuidesDirectory.getEntries()

  return entries.map((entry) => ({
    slug: entry.getPathnameSegments({ includeBasePathname: false }),
  }))
}

export default async function Guide({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const file = await GuidesDirectory.getFile(slug, 'mdx')

  return <DocumentEntry file={file} collection={RootCollection} />
}
