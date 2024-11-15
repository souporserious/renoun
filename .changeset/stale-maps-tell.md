---
'renoun': major
---

Introduces more performant, type-safe file system from utilities exported from `renoun/file-system` to replace the `renoun/collections` API, which will be removed in a future major release.

- **New Classes:**
  - `NodeFileSystem`, `VirtualFileSystem`, `Directory`, `File`, `JavaScriptFile`, and `JavaScriptFileExport`.
- **Improvements:**
  - Optimized performance, stronger TypeScript support, and in-memory support with `VirtualFileSystem`.

### Migration Example

**Before:**

```typescript
const collection = new Collection({
  filePattern: 'src/**/*.{ts,tsx}',
  baseDirectory: 'src',
})
const sources = await collection.getSources()
```

**After:**

```typescript
const directory = new Directory({ path: 'src' })
const entries = await directory.getEntries()
```

The new file system utilities offer clearer APIs, better performance, and improved developer experience. This is still experimental and API parity with the old collections API is still in progress. Please report any issues you encounter.
