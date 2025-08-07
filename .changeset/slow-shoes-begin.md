---
'renoun': patch
---

Fixes the `CodeBlock` and `CodeInline` component's internal `Suspense` fallback triggering in production. This is used to speed up local development so it should never show in production.
