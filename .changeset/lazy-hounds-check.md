---
'renoun': minor
---

Moves import map generation from the `.renoun` directory to the second argument of the `createCollection` call expression. This will automatically be updated to the new `filePattern` argument and generate the import getter for each collection:

```ts
import { createCollection } from 'renoun/collections'

export const DocsCollection = createCollection(
  {
    filePattern: 'docs/**/*.mdx',
    baseDirectory: 'docs',
    basePath: 'docs',
  },
  (slug) => import(`docs/${slug}.mdx`)
)
```

This reduces a lot of boilerplate and configuration. Previously, the `.renoun` directory needed to be generated, added to `.gitignore`, and then the server needed to be restarted after the first initialization. Now, import maps are colocated with their respective collection configuration.
