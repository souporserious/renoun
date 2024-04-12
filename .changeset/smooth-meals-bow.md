---
'mdxts': minor
---

Allow overriding `frontMatter` type through `createSource` generic.

```ts
import { createSource } from 'mdxts'

export const allDocs = createSource<{
  frontMatter: {
    title: string
    description: string
    date: string
    tags?: string[]
  }
}>('docs/*.mdx')
```
