---
'renoun': minor
---

Refactors `Generic` kind that can be returned from `JavaScriptFileExport#getType` into two separate `Utility` and `UtilityReference` kinds. This is more explicit in how types are resolved based on where the type resolution starts from.

```ts
// "Partial" is resolved as a "Utility" kind when starting from the type alias
type Partial<Type> = {
  [Key in keyof Type]?: Type[Key]
}

// Whereas "Partial" here is resolved as a "UtilityReference" kind when resolved from within a type
interface Props<Type> {
  options: Partial<Type>
}
```
