---
'renoun': patch
---

- Prefers base files over modifier files when selecting a directory representative (e.g. `Link.tsx` over `Link.examples.tsx`).
- Normalizes `MemoryFileSystem.getRelativePathToWorkspace` to strip leading `./` so repository URLs do not contain `/./`.
