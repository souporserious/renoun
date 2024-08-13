---
'mdxts': patch
---

Moves to an options object for `getSources` and `getSiblings`.

```diff
- source.getSources(1);
+ source.getSources({ depth: 1 });

- source.getSiblings(0);
+ source.getSiblings({ depth: 0 });
```
