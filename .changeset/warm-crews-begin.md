---
'mdxts': minor
---

Adds front matter type validation using the generic passed to `createSource`:

```ts
import { createSource } from 'mdxts'

export const allPosts = createSource<{
  frontMatter: {
    title: string
    date: Date
    summary: string
    tags?: string[]
  }
}>('posts/**/*.mdx', { baseDirectory: 'posts' })
```

```posts/markdown-guide.mdx
---
title: Hello World
date: 2021-01-01
---

# Hello World

This is a post.
```

Results in the following type error:

```
Error: Front matter data is incorrect or missing
[/posts/markdown-guide.mdx] Type '{}' does not satisfy the expected type 'frontMatter'.
Type '{}' is missing the following properties from type 'frontMatter': summary
```
