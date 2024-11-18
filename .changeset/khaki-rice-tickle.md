---
'renoun': minor
---

Adds `shouldFormat` prop to `CodeBlock` component to allow disabling code formatting. This is useful for MDX code blocks that are already formatted by an IDE or CI environment.

```tsx
export function useMDXComponents() {
  return {
    pre: (props) => {
      return <CodeBlock shouldFormat={false} {...restProps} />
    },
  }
}
```
