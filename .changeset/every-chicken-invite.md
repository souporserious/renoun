---
'renoun': minor
---

Adds a `TableOfContents` component to render a list of headings for a document. This can be used with the [headings MDX plugin](https://www.renoun.dev/guides/mdx#remark-add-headings) to generate a table of contents for a page.

```tsx
import { TableOfContents } from 'renoun'
import Content, { headings } from './content.mdx'

export default function Page() {
  return (
    <main
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 16rem',
        gap: '2rem',
      }}
    >
      <article>
        <Content />
      </article>
      <aside>
        <TableOfContents items={headings} />
      </aside>
    </main>
  )
}
```
