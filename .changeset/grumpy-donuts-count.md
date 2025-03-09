---
'renoun': minor
---

Renames the `MDXRenderer` `value` prop to `children` to be consistent with other components.

### Breaking Changes

The `MDXRenderer` `value` prop has been renamed to `children`:

```diff
-<MDXRenderer value="# Hello World" />
+<MDXRenderer># Hello World</MDXRenderer>
```
