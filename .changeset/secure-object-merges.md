---
'@renoun/mdx': patch
'renoun': patch
---

Guards object merges against prototype pollution in the MDX and core packages by skipping dangerous keys when spreading user-authored data.
