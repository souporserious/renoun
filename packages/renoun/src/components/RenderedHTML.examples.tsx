import React from 'react'
import { CodeBlock, RenderedHTML } from 'renoun/components'

export function Basic() {
  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <h2>Input</h2>
        <CodeBlock language="jsx">
          {`<h1 style={{ fontSize: '6rem' }}>Hello World</h1>`}
        </CodeBlock>
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

export function IncludeHtml() {
  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <h2>Input</h2>
        <CodeBlock allowErrors language="jsx">
          {`export default function Page() {\nreturn <><h1>Hello World</h1>\n<style href="h1" precedence="low">\n{\`h1 { font-size: 6rem;}\`}\n</style></>\n}`}
        </CodeBlock>
      </div>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <h2>Output</h2>
        <RenderedHTML>
          <h1>Hello World</h1>
          <style href="h1" precedence="low">{`h1 { font-size: 6rem; }`}</style>
        </RenderedHTML>
      </div>
    </div>
  )
}
