---
'renoun': minor
---

Renames `MDXContent` to `MDXRenderer`. This was causing confusion with the `MDXContent` type exported from `renoun/mdx` and better reflects the purpose of the component.

### Breaking Changes

- Rename any `MDXContent` references to `MDXRenderer`.
