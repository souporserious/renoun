---
'renoun': minor
---

Fixes running multiple renoun WebSocket servers by setting the port to `0` by default. This allows the OS to assign an available port.

This also adds a new `startServer` function that will only ever start the WebSocket server once per process. This is useful in frameworks like Next.js where the configuration is not shared across multiple instances.

```ts
import { startServer } from 'renoun/server'

await startServer()
```
