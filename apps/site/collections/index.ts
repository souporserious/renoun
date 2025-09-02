import { Collection } from 'renoun'

import { ComponentsDirectory, HooksDirectory } from './renoun'
import { DocsDirectory, GuidesDirectory } from './site'

export const RootCollection = new Collection({
  entries: [
    DocsDirectory,
    ComponentsDirectory,
    HooksDirectory,
    GuidesDirectory,
  ],
})
export * from './renoun'
export * from './site'
