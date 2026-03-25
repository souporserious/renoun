---
'renoun': patch
---

Improves `Directory#getStructure()` indexing performance by flattening
directory structure collection, reusing persisted structure manifests on warm
reads, and batching module export metadata for header-only JavaScript
structures. This additionally adds prewarm support for
`Directory#getStructure()` callsites so search and other indexing routes can
warm structure caches.
