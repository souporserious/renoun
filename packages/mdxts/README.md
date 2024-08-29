<div align="center">
  <a href="https://mdxts.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/packages/mdxts/images/logo-dark.png">
      <img src="/packages/mdxts/images/logo-light.png" alt="MDXTS" width="164"/>
    </picture>
  </a>
  <h2>The Content & Documentation SDK for React</h2>
  <p>
MDXTS is a collection of components and utilities for rendering <br /><a href="https://mdxjs.com/">MDX</a> content, type documentation, and code examples in React.
  </p>
</div>

## Features

- 📝 Quickly start authoring MDX
- ✅ Type-check content
- 📘 Generate type documentation
- 📊 Gather module metadata
- 🖼️ Preview source code examples
- 📁 Generate file-based routes
- 🌈 Accurately highlight code blocks

## Getting Started

```bash
npm install mdxts
```

After installing the package and required dependencies, you can start creating content or documentation using any framework that supports React Server Components.

To get started, use the `createCollection` function to render a collection of files from the file system:

```tsx
import { createCollection } from 'mdxts/collections'

const posts = createCollection('docs/*.mdx')

export default async function Page({ params }) {
  const Content = await posts
    .getSource(params.slug)
    .getDefaultExport()
    .getValue()

  return <Content />
}
```

There are many different components to help facilitate writing technical content. Visit the [Getting Started](https://mdxts.dev/docs/getting-started) guide to view the full documentation and learn more about the features and capabilities of MDXTS.

## License

[AGPLv3](/LICENSE.md) © [souporserious](https://souporserious.com/)
