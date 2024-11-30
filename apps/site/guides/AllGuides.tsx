import { GuidesCollection } from '@/collections'
import { Card } from '@/components/Card'

export async function AllGuides() {
  const entries = await GuidesCollection.getEntries()

  return entries.map(async (entry, index) => {
    const metadata = await entry.getExport('metadata').getRuntimeValue()

    return (
      <Card
        key={index}
        href={entry.getPath()}
        label={metadata.label ?? metadata.title}
      />
    )
  })
}
