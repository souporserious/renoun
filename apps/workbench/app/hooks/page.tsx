import { HooksDirectory } from '@/collections'
import { EntryIndex } from '@/ui/EntryIndex'

export default async function Hooks() {
  const entries = await HooksDirectory.getEntries()

  return <EntryIndex title="Hooks" entries={entries} />
}
