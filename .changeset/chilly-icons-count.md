---
'renoun': minor
---

Adds `useSectionObserver` hook for tracking the active section currently in view:

```tsx
import React from 'react'
import { useSectionObserver } from 'renoun/hooks'

export function TableOfContents() {
  const observer = useSectionObserver()

  return (
    <div style={{ display: 'flex', gap: '2rem' }}>
      <aside style={{ position: 'sticky', top: '1rem' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {[
            { id: 'intro', label: 'Introduction' },
            { id: 'usage', label: 'Usage' },
            { id: 'api', label: 'API Reference' },
          ].map(({ id, label }) => (
            <SectionLink key={id} id={id} label={label} observer={observer} />
          ))}
        </ul>
      </aside>

      <main>
        <section id="intro">
          <h2>Introduction</h2>
          <p>…</p>
        </section>

        <section id="usage">
          <h2>Usage</h2>
          <p>…</p>
        </section>

        <section id="api">
          <h2>API Reference</h2>
          <p>…</p>
        </section>
      </main>
    </div>
  )
}

function SectionLink({
  id,
  label,
  observer,
}: {
  id: string
  label: string
  observer: ReturnType<typeof useSectionObserver>
}) {
  const [isActive, linkProps] = observer.useLink(id)

  return (
    <li style={{ marginBottom: '0.5rem' }}>
      <a
        href={`#${id}`}
        {...linkProps}
        style={{
          color: isActive ? 'crimson' : 'black',
          fontWeight: isActive ? 'bold' : 'normal',
          textDecoration: 'none',
        }}
      >
        {label}
      </a>
    </li>
  )
}
```
