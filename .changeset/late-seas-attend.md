---
'renoun': minor
---

Adds `renoun/server` export for more control of running the WebSocket server. For example, in Next.js this can be used with the `instrumentation.ts` file:

```ts
import { createServer } from 'renoun/server'

export async function register() {
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    createServer()
  }
}
```
