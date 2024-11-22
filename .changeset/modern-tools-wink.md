---
'renoun': minor
---

Adds an `EntryGroup` utility to `renoun/file-system` that provides an interface for querying and navigating a group of entries:

```ts
import { Directory, EntryGroup } from 'renoun/file-system'

interface FrontMatter {
  title: string
  description?: string
  date: string
  tags?: string[]
}

interface MDXType {
  frontmatter: FrontMatter
}

const posts = new Directory<{ mdx: MDXType }>({
  path: 'posts',
})
const docs = new Directory<{ mdx: MDXType }>({
  path: 'docs',
})
const group = new EntryGroup({
  entries: [posts, docs],
})
const entries = await group.getEntries()
```

This also adds `getHasEntry` and `getHasFile` methods to `Directory` which can be used to check if an entry or file exists in an `EntryGroup`:

```ts
type MDXTypes = { metadata: { title: string } }
type TSXTypes = { title: string }

const directoryA = new Directory<{ mdx: MDXTypes }>({
  fileSystem: new VirtualFileSystem({ 'Button.mdx': '' }),
})
const directoryB = new Directory<{ tsx: TSXTypes }>({
  path: 'fixtures/components',
})
const group = new EntryGroup({
  entries: [directoryA, directoryB],
})
const entry = await group.getEntryOrThrow('Button')
const hasFile = await directoryA.getHasFile(entry)

if (hasFile(entry, 'mdx')) {
  entry // JavaScriptFile<MDXTypes>
}
```
