---
'renoun': minor
---

Strictly requires Node.js 22 now since utilities rely on a `WebSocket` client. This was erroring in version 20 already since the `WebSocket` client was still behind a flag.
