---
'renoun': minor
---

Adds a `Script` component that lets you author a client-side script using a normal source file that is then injected into HTML either inline, deferred, or as a hoisted data URL. This is useful for small scripts like analytics snippets, theme preferences, feature flags, or bootstrapping navigation active states.

```tsx path="app/page.tsx"
import { Script } from 'renoun'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <head>
        <Script>{import('./table-of-contents-script.ts')}</Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
```
