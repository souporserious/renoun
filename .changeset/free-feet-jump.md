---
'renoun': minor
---

Adds support for defining multiple syntax highlighting themes in `renoun.json`:

```json
{
  "theme": {
    "light": "vitesse-light",
    "dark": "vitesse-dark"
  }
}
```

This requires using a new `ThemeProvider` component that will inject the proper CSS Variables in the head of the document:

```tsx
import { ThemeProvider } from 'renoun/components'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider />
        {children}
      </body>
    </html>
  )
}
```
