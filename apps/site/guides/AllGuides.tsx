import { GuidesCollection } from '@/collections'
import { Card } from '@/components/Card'

export function AllGuides() {
  return GuidesCollection.getSources().then((sources) =>
    sources.map(async (source, index) => {
      const metadata = await source.getExport('metadata').getValue()
      return (
        <Card
          key={index}
          href={source.getPath()}
          label={metadata.label ?? metadata.title}
        />
      )
    })
  )
}
