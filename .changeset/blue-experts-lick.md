---
'mdxts': minor
---

This adds an `mdxts` cli command to allow running the project analysis in a separate process to improve overall performance during local development.

## CLI

This can be prepended to your framework's development process e.g. `next dev`. For example, to start the `mdxts` process prior to starting the Next.js server simply prepend the `mdxts` command:

```json
{
  "scripts": {
    "dev": "mdxts next",
    "build": "mdxts next build"
  }
}
```

This ensures the server starts and allows decoupling the code block analysis and syntax highlighting from Next.js.

Alternatively, the process can be managed yourself using a library like [concurrently](https://github.com/open-cli-tools/concurrently):

```json
{
  "scripts": {
    "dev": "concurrently \"mdxts watch\" \"next\"",
    "build": "mdxts && next build"
  }
}
```

## Collections

This also introduces a new `createCollection` utility:

```ts
import {
  createCollection,
  type MDXContent,
  type FileSystemSource,
} from 'mdxts/collections'

export type PostSchema = {
  default: MDXContent
  frontmatter?: {
    title: string
    description: string
  }
}

export type PostSource = FileSystemSource<PostSchema>

export const PostsCollection = createCollection<PostSchema>(
  '@/posts/**/*.{ts,mdx}',
  {
    title: 'Posts',
    baseDirectory: 'posts',
    basePath: 'posts',
  }
)
```

Collections will soon replace the `createSource` utility and provide a more performant and flexible way to query file system information and render module exports. They focus primarily on querying source files and providing a way to analyze and render file exports.
