import { Collection } from 'renoun/file-system'

import { ComponentsDirectory } from './renoun'
import { DocsDirectory, GuidesDirectory } from './site'

export const RootCollection = new Collection({
  entries: [DocsDirectory, ComponentsDirectory, GuidesDirectory],
})
export * from './renoun'
export * from './site'
