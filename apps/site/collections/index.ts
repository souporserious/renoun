import { Collection } from 'renoun'

import { ComponentsDirectory } from './renoun'
import { DocsDirectory, GuidesDirectory } from './site'

export const RootCollection = new Collection({
  entries: [DocsDirectory, ComponentsDirectory, GuidesDirectory],
})
export * from './renoun'
export * from './site'
