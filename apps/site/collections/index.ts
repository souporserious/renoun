import { Collection } from 'renoun'

import { HooksDirectory, PublicComponentsDirectory } from './renoun'
import { DocsDirectory, GuidesDirectory } from './site'

export const RootCollection = new Collection({
  entries: [
    DocsDirectory,
    PublicComponentsDirectory,
    HooksDirectory,
    GuidesDirectory,
  ],
})
export * from './renoun'
export * from './site'
