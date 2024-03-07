<div align="center">
  <a href="https://mdxts.dev">
    <img src="/site/public/logo.png" alt="MDXTS" width="164"/>
  </a>
  <h2>The Content & Documentation SDK for React</h2>
  <p>
MDXTS (Beta) is a collection of components and utilities for rendering content, type documentation, and code examples using React Server Components.
  </p>
</div>

## Features

- ✅ Type-checked content
- 📄 Generated type documentation
- 🔍 Source code previews
- 📁 File-based routing
- 🎨 Accurate syntax highlighting

## Getting Started

[Next.js](https://nextjs.org/) is the recommended way to use MDXTS and has first-class support through a [plugin](https://www.mdxts.dev/packages/next). Use the CLI in a Next.js project to get started using MDXTS:

```bash
npm create mdxts
```

After installing the package and required dependencies, you can start creating content or documentation using MDX. Simply render MDX as pages or use the `createSource` function to create a source for rendering a collection of MDX files:

```tsx
import { createSource } from 'mdxts'

const posts = createSource('docs/*.mdx')

export default async function Page({ params }) {
  const { Content } = await posts.get(params.slug)
  return <Content />
}
```

Visit the [Getting Started](https://mdxts.org/docs/getting-started) guide to view the full documentation.

## License

[MIT](/LICENSE.md) © [souporserious](https://souporserious.com/)
