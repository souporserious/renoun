---
'renoun': minor
---

Replaces the `renoun.json` configuration file with a `RootProvider` component. This also removes the need to configure the `Refresh` and `ThemeStyles` components.

### Breaking Changes

The `renoun.json` configuration file is no longer used to configure renoun. Please refactor to the `RootProvider` component:

```tsx
import { RootProvider } from 'renoun'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RootProvider
      git="souporserious/renoun"
      siteUrl="https://renoun.dev"
      theme="theme.json"
    >
      <html>
        <body>{children}</body>
      </html>
    </RootProvider>
  )
}
```
