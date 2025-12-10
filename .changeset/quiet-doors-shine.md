---
'renoun': patch
---

Fixes a regression where the `Reference` component would expand all properties from external attribute interfaces (e.g., `React.ButtonHTMLAttributes`) instead of keeping them as type references. External attribute interfaces are now only inlined when explicitly requested via the `filter` prop, and only the specified properties are included.
