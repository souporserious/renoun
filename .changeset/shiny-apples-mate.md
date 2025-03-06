---
'renoun': minor
---

Adds a new `useThemePicker` hook for selecting a theme from the configured themes:

```tsx
'use client'
import { useThemePicker } from 'renoun/components'

export function ThemePicker() {
  const [theme, setTheme] = useThemePicker()

  return (
    <select value={theme} onChange={(event) => setTheme(event.target.value)}>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  )
}
```

The theme can be toggled or set explicitly using the `setTheme` function. Note, that `theme` is always initially set to `undefined` since it cannot be known until the React tree is hydrated. Use the `data-theme` attribute to style the app based on the selected theme.
