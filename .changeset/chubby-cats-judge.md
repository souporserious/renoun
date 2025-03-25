---
'@renoun/mdx': minor
---

Adds exports for all `remark` and `rehype` plugins. Plugins can now be imported as grouped plugins:

```tsx
import remarkRenoun from '@renoun/mdx/remark'
import rehypeRenoun from '@renoun/mdx/rehype'
```

Or as individual plugins:

```tsx
import rehypeAddReadingTime from '@renoun/mdx/rehype/add-reading-time'
import remarkAddHeadings from '@renoun/mdx/remark/add-headings'
```
