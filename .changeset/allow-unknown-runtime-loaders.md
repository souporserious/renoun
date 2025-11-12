---
'renoun': patch
---

Relaxes `withSchema` runtime-only overloads to allow `unknown` loader return types. This better enables loaders sourced from patterns like `import.meta.glob` to type-check, while still encouraging typed loaders when available.

