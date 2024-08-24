---
'mdxts': minor
---

Adds support for defining schemas for collections:

```tsx
import { createCollection, type MDXContent } from 'mdxts/collections'
import { z } from 'zod'

const frontmatterSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const PostsCollection = createCollection<{
  default: MDXContent
  frontmatter: z.infer<typeof frontmatterSchema>
}>('posts/*.mdx', {
  baseDirectory: 'posts',
  schema: {
    frontmatter: frontmatterSchema.parse,
  },
})
```
