---
'renoun': minor
---

Renames the `CodeInline` `value` prop to `children` to better integrate with Markdown and MDX renderers.

### Breaking Changes

The `CodeInline` `value` prop has been renamed to `children`:

```diff
-<CodeInline language="js" value="const foo = 'bar';" />
+<CodeInline language="js">const foo = 'bar';</CodeInline>
```
