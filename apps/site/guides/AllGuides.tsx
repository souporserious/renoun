import { GuidesDirectory } from '@/collections'
import { Card } from '@/components/Card'

export async function AllGuides() {
  const entries = await GuidesDirectory.getEntries({ filter: '*.mdx' })

  return entries.map(async (entry, index) => {
    const metadata = await entry.getExportValue('metadata')

    return (
      <Card
        key={index}
        href={entry.getPathname()}
        label={metadata.label ?? metadata.title}
      />
    )
  })
}
