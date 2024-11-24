---
'renoun': minor
---

Moves the `Directory` `schema` option to `<Directory>.withSchema`. This aligns with the recent refactor of the `getImport` option to `<Directory>.withModule`.

### Breaking Changes

Update the `schema` option to `withSchema`:

```diff
export const posts = new Directory<{ mdx: PostType }>({
    path: 'posts',
--    schema: { mdx: { frontmatter: frontmatterSchema.parse } },
})
++  .withSchema('mdx', { frontmatter: frontmatterSchema.parse })
```
