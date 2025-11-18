---
'renoun': minor
---

Adds a `Package` file-system helper that can locate packages from workspaces, `node_modules`, or remote packages, analyze their `exports` / `imports` fields, and expose simple `getExport` / `getImport` APIs for inspecting package entry points.

```ts
import { Package } from 'renoun'

const renounMdx = new Package({
  name: '@renoun/mdx',
  loader: {
    'remark/add-headings': () => import('@renoun/mdx/remark/add-headings'),
  },
})
const remarkAddHeadings = await renounMdx.getExport('remark/add-headings')
const defaultExport = await remarkAddHeadings.getExport('default')

await defaultExport.getRuntimeValue()
await defaultExport.getType()
```
