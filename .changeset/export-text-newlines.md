---
'renoun': patch
---

Fixes a bug where the provided `Tokens` code could concatenate a template literal and a following `import` without a separating newline, causing the formatter to throw.
