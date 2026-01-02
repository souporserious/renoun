---
'renoun': major
---

Simplifies defining `Directory` schemas by removing the `withSchema` loader utility and moving to a `schema` option instead.

### Breaking Changes

The `withSchema` utility has been removed in favor of configuring schema validation using the new `schema` option.

Before:

```ts
import { Directory, withSchema } from 'renoun'
import { z } from 'zod'

export const posts = new Directory({
  path: 'posts',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(
      {
        metadata: z.object({
          title: z.string(),
          date: z.coerce.date(),
        }),
      },
      (path) => import(`./posts/${path}.mdx`)
    ),
  },
})
```

After:

```ts
import { Directory } from 'renoun'
import { z } from 'zod'

export const posts = new Directory({
  path: 'posts',
  filter: '*.mdx',
  schema: {
    mdx: {
      metadata: z.object({
        title: z.string(),
        date: z.coerce.date(),
      }),
    },
  },
  loader: {
    mdx: (path) => import(`./posts/${path}.mdx`),
  },
})
```
