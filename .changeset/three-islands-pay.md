---
'renoun': minor
---

Directory entries are now included in the `Directory#getEntries` result when a recursive `include` file pattern is configured e.g. `new Directory({ include: '**/*.mdx' })`. This allows easier access to directories when building navigations.
