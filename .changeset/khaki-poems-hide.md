---
'renoun': minor
---

Refactors `Tokens` to use slot-based `components` overrides for token spans, diagnostics, and quick info popovers.

### Breaking Changes

`Tokens` no longer accepts `css`, `className`, or `style` props. Move those overrides to the new `components` slots instead:

```diff
<Tokens
--  css={{
--    popover: {
--      marginTop: '0.5rem',
--    },
--  }}
--  className={{
--    token: 'custom-token',
--  }}
+  components={{
+    Popover: {
+      css: {
+        marginTop: '0.5rem',
+      },
+    },
+    Token: {
+      className: 'custom-token',
+    },
+  }}
/>
```

Use `components.Token`, `components.Error`, and `components.Popover` for the old `token`, `error`, and `popover` override targets.
