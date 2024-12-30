---
'renoun': minor
---

Refactors the `Directory` builder pattern to move back to an object configuration with the addition of a new `withSchema` helper, allowing strong type inference and colocated file export type definitions:

```ts
import { Directory, withSchema } from 'renoun/file-system'
import { z } from 'zod'

export const Posts = new Directory({
  path: 'posts',
  include: '*.mdx',
  loaders: {
    mdx: withSchema(
      {
        frontmatter: z.object({
          title: z.string(),
          description: z.string(),
          date: z.date(),
          tags: z.array(z.string()).optional(),
        }),
      },
      (path) => import(`@/posts/${path}.mdx`)
    ),
  },
})
```

Note, some additional changes have also been made:

- `withModule` has been replaced in favor of a `loaders` option.
- `withFilter` has been replaced by an `include` option to better align with TypeScript's configuration naming.
- The new `include` filter now also accepts a string glob file pattern e.g. `*.mdx`.
- An extension **must** be provided for loaders, this ensures that arbitrary file extensions are not loaded by mistake.
- [Standard Schema](https://github.com/standard-schema/standard-schema) is now used to automatically infer types from libraries that adhere to the spec (Zod, Valibot, Arktype).
- The `MDXContent` type is now included by default for MDX file `default` exports.
- Internally, the `JavaScriptFileWithRuntime` class was collapsed into `JavaScriptFile`. This was originally added to provide strong types when a runtime loader was or was not available, but caused too much complexity. In the future, a runtime loader will be added automatically if not explicitly defined.

### Breaking Changes

The builder pattern configuration for `Directory` has been refactored to use an object configuration with the addition of a new `withSchema` helper. This change is breaking for any existing code that uses the `Directory` builder pattern. The `withSchema` helper is now required to provide strong type inference and colocated file export type definitions.

#### Before

```ts
import { Directory } from 'renoun/file-system'

interface PostTypes {
  mdx: {
    default: MDXContent
  }
}

const posts = new Directory<PostTypes>('posts').withModule(
  (path) => import(`./posts/${path}`)
)
```

#### After

```ts
import { Directory } from 'renoun/file-system'

const posts = new Directory<PostTypes>({
  path: 'posts',
  loaders: {
    mdx: (path) => import(`./posts/${path}.mdx`),
  },
})
```
