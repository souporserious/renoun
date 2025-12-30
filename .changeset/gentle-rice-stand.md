---
'renoun': major
---

Refactors `CodeBlock` and `Command` to use a `components` prop override API and removes the `css`, `className`, and `style` props.

### Breaking Changes

`CodeBlock` and `Command` no longer accept `css`, `className`, or `style` props. Use the new `components` prop to override internal components or their props:

```diff
<CodeBlock
--  css={{
--    container: {
--      marginTop: '1rem',
--    },
--  }}
+  components={{
+    Container: {
+      css: {
+        marginTop: '1rem',
+      },
+    }
+  }}
/>
```
