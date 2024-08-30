<div align="center">
  <a href="https://omnidoc.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/packages/omnidoc/images/logo-dark.png">
      <img src="/packages/omnidoc/images/logo-light.png" alt="Omnidoc" width="320"/>
    </picture>
  </a>
  <h2>Documentation That Matches the Quality of Your Product</h2>
  <p>
Meticulously crafted React components and utilities, designed to elevate every stage of your JavaScript documentation.
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
npm install omnidoc
```

After installing the package and required dependencies, you can start creating content or documentation using any framework that supports React Server Components.

To get started, use the `createCollection` function to render a collection of files from the file system:

```tsx
import { createCollection } from 'omnidoc/collections'

const posts = createCollection('docs/*.mdx')

export default async function Page({ params }) {
  const Content = await posts
    .getSource(params.slug)
    .getDefaultExport()
    .getValue()

  return <Content />
}
```

There are many different components to help facilitate writing technical content. Visit the [site](https://omnidoc.dev) to view the full documentation and learn more about the features and capabilities of Omnidoc.

## License

[AGPLv3](/LICENSE.md) © [souporserious](https://souporserious.com/)
