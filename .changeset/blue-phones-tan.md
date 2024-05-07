---
'mdxts': minor
---

Refines `paths` returned from `createSource` and `mergeSources`. Based on the glob pattern provided, either a one-dimensional or two-dimensional array of paths will be returned:

```ts
import { createSource, mergeSources } from 'mdxts'

const allPosts = createSource('posts/*.mdx').paths() // string[]
const allDocs = createSource('docs/**/*.mdx').paths() // string[][]
const allPaths = mergeSources(allDocs, allPosts).paths() // string[] | string[][]
```

Likewise the `get` method will be narrowed to only accept a single pathname or an array of pathname segments:

```ts
allPosts.get('building-a-button-component-in-react')
allDocs.get(['examples', 'authoring'])
```

### Breaking Changes

- The `paths` method now returns a one-dimensional array of paths for a single glob pattern and a two-dimensional array of paths for multiple glob patterns.
- The `get` method now only accepts a single pathname or an array of pathname segments.

You may need to update your code to accommodate these changes:

```diff
export function generateStaticParams() {
--  return allPosts.paths().map((pathname) => ({ slug: pathname.at(-1) }))
++  return allPosts.paths().map((pathname) => ({ slug: pathname }))
}
```
