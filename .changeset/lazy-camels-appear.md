---
'renoun': minor
---

Moves the `Directory` `basePath` option to `<Directory>.withBasePath`. This aligns with the recent refactor of other `Directory` options.

### Breaking Changes

Update the `basePath` option to `withBasePath`:

```diff
export const posts = new Directory<{ mdx: PostType }>({
    path: 'posts',
--    basePath: 'blog',
})
++  .withBasePath('blog')
```
