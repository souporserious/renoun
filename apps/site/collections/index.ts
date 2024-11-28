import { EntryGroup } from 'renoun/file-system'
import { ComponentsCollection } from './renoun'
import { DocsCollection, GuidesCollection } from './site'

export const CollectionGroup = new EntryGroup({
  entries: [DocsCollection, ComponentsCollection, GuidesCollection],
})
export * from './renoun'
export * from './site'
