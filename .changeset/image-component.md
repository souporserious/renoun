---
'renoun': minor
---

Introduces a new `<Image>` component that is able to fetch component frames, names, and descriptions directly from configured Figma files:

```tsx
import { Image } from 'renoun'

export function Page() {
  return <Image source="figma:icons/arrow-down" />
}
```
