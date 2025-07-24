import { GuidesDirectory } from '@/collections'
import { DocumentEntry } from '@/components/DocumentEntry'

export default async function Guides() {
  const file = await GuidesDirectory.getFile('index', 'mdx')

  return (
    <DocumentEntry
      file={file}
      shouldRenderTableOfContents={false}
      shouldRenderUpdatedAt={false}
    />
  )
}
