---
'mdxts': minor
---

Adds `focusedLines` and `unfocusedLinesOpacity` props to the `CodeBlock` component to control focusing a set of lines and dimming the other lines. It uses an image mask to dim out the lines which can be controlled using `unfocusedLinesOpacity`:

````mdx
```tsx focusedLines="3-4"
const a = 1
const b = 2
const result = a + b
console.log(result) // 3
```
````

```tsx
<CodeBlock
  value={`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
  focusedLines="2, 4"
/>
```
