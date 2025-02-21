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

To use a specific theme, append a `data-theme` attribute to the `html` element or another parent element:

```tsx
<html data-theme="dark" lang="en">
  <body>
    <ThemeProvider />
    {children}
  </body>
</html>
```
