---
'mdxts': minor
---

Move source item `gitMetadata` to top-level fields.

```diff
import { MetadataRoute } from 'next'
import { allData } from 'data'

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(allData.all()).map((data) => ({
    url: `https://mdxts.dev/${data.pathname}`,
---    lastModified: data.gitMetadata.updatedAt,
+++    lastModified: data.updatedAt,
  }))
}
```
