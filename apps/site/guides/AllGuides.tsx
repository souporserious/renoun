import { GuidesCollection } from '@/collections'
import { Card } from '@/components/Card'

export function AllGuides() {
  return GuidesCollection.getSources().then((sources) =>
    sources.map((source, index) => (
      <Card key={index} href={source.getPath()} label={source.getTitle()} />
    ))
  )
}
