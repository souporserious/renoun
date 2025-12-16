import { ComponentsDirectory } from '@/collections'
import { EntryIndex } from '@/ui/EntryIndex'

export default async function Components() {
  const entries = await ComponentsDirectory.getEntries()

  return <EntryIndex title="Components" entries={entries} />
}
