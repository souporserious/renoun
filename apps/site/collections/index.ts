import { Collection } from 'renoun'

import { HooksDirectory, PublicComponentEntries } from './renoun'
import { DocsDirectory, GuidesDirectory } from './site'

export const RootCollection = new Collection({
  entries: [
    DocsDirectory,
    ...PublicComponentEntries,
    HooksDirectory,
    GuidesDirectory,
  ],
})
export * from './renoun'
export * from './site'
