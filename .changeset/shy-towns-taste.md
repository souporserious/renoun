---
'renoun': patch
---

Adds support for resolving construct signature types:

```tsx
interface Foo {
  new (x: number): Foo
}
```
