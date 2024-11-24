---
'renoun': minor
---

Moves the `Directory` `getImport` option to `<Directory>.withModule`. This provides stronger types for inferring the `getRuntimeValue` method.

### Breaking Changes

Update the `getImport` option to `withModule`:

```diff
export const posts = new Directory<{ mdx: PostType }>({
    path: 'posts',
    schema: { mdx: { frontmatter: frontmatterSchema.parse } },
--    getImport: (path) => import(`./posts/${path}`),
})
++  .withModule((path) => import(`./posts/${path}`))
```
