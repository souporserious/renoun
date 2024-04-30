---
'mdxts': minor
---

Enables type-checking for the `CodeBlock` component. To opt-out of type-checking, use the `allowErrors` prop on the code block:

```tsx allowErrors
const a = 1
a + b
```

This will disable type-checking for the code block and prevent erroring. To show the errors, usually for educational purposes, use the `showErrors` prop:

```tsx allowErrors showErrors
const a = 1
a + b
```

### Breaking Changes

`CodeBlock` now throws an error if the code block is not valid TypeScript. This is to ensure that all code blocks are type-checked and work as expected.
