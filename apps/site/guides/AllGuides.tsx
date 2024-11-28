import { GuidesCollection } from '@/collections'
import { Card } from '@/components/Card'

export async function AllGuides() {
  const entries = await GuidesCollection.getEntries()

  return entries.map(async (source, index) => {
    const metadata = await source.getExport('metadata').getRuntimeValue()

    return (
      <Card
        key={index}
        href={source.getPath()}
        label={metadata.label ?? metadata.title}
      />
    )
  })
}
