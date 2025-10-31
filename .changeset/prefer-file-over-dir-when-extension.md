---
'renoun': patch
---

Fixes file resolution when a directory shares the same base name as the
requested file and an extension is specified. The resolver now prefers the
exact file match (e.g. `package.json`) over a same‑named directory (e.g.
`package/`).
