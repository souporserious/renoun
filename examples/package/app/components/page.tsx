import { ComponentsCollection } from '@/collections'
import { EntryIndex } from '@/ui/EntryIndex'

export default async function Components() {
  const entries = await ComponentsCollection.getEntries()

  return <EntryIndex title="Components" entries={entries} />
}
