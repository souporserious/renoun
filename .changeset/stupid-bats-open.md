---
'renoun': minor
---

Adds a first-class `Refresh` component for refreshing the server during development when a source file changes:

```tsx
import { Refresh } from 'renoun/components'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Refresh />
      </body>
    </html>
  )
}
```

This was previously automated for `JavaScriptFile` / `MDXFile` component exports. However, it did not provide a robust enough solution for all use cases. This new component ensures that only one listener will ever be added.
