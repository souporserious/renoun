---
'renoun': minor
---

Adds an LRU cache implementation to the `renoun` cli WebSocket server to de-duplicate incoming client requests. This is especially useful during builds that are parallelized and can cause many duplicate client requests.
