---
'renoun': minor
---

Moves import map generation from `.renoun` directory to a `importMap` configuration option that will get automatically generated for each collection:

```ts
import { createCollection } from 'renoun/collections'

export const DocsCollection = createCollection('docs/**/*.mdx', {
  baseDirectory: 'docs',
  basePath: 'docs',
  importMap: [(slug) => import(`docs/${slug}.mdx`)],
})
```

This reduces a lot of boilerplate and configuration. Previously, the `.renoun` directory needed to be generated, added to `.gitignore`, and the server restarted after the first initialization. Now import maps are colocated with their respective collection configuration.
