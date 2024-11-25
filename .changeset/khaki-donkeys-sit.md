---
'renoun': minor
---

Moves the `Directory` `schema` option to `<Directory>.withSchema`. This aligns with the other recent refactor of `Directory` options.

### Breaking Changes

Update the `schema` option to `withSchema`:

```diff
export const posts = new Directory<{ mdx: PostType }>({
    path: 'posts',
--    schema: { mdx: { frontmatter: frontmatterSchema.parse } },
})
++  .withSchema('mdx', { frontmatter: frontmatterSchema.parse })
```
