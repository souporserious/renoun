---
'mdxts': minor
---

Adds `RenderedHTML` component for rendering `children` as a highlighted HTML string in a `CodeBlock`:

```tsx
export function Basic() {
  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <h2>Input</h2>
        <CodeBlock
          language="jsx"
          value="<h1 style={{ fontSize: '6rem' }}>Hello World</h1>"
        />
      </div>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <h2>Output</h2>
        <RenderedHTML includeHtml={false}>
          <h1 style={{ fontSize: '6rem' }}>Hello World</h1>
        </RenderedHTML>
      </div>
    </div>
  )
}
```
