---
'renoun': minor
---

Renames `CodeBlock` `filename` prop to `path` to better reflect its purpose since a nested file path can be defined.

### Breaking Changes

The `filename` prop in the `CodeBlock` component has been renamed to `path`. Update any references to the `filename` prop in components or MDX pages that use the `CodeBlock` component for rendering code fences.
