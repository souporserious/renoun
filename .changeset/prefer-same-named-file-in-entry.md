---
'renoun': patch
---

The `Directory#getEntry` method now prefers a directory representative file (index/readme/same-name), otherwise it returns the directory. If no directory exists at the path, it returns a matching file in the immediate entries.

```ts
// components/Button/Button.tsx
await new Directory({ path: 'components' }).getEntry('button') // JavaScriptFile
```
