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

Using MDXTS in [Next.js](https://nextjs.org/) is currently the easiest way to get started. Follow the [manual setup](https://www.mdxts.dev/docs/getting-started#manual-setup) or use the CLI in a Next.js project to automate the [plugin](https://www.mdxts.dev/packages/next) configuration:

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

Visit the [Getting Started](https://mdxts.dev/docs/getting-started) guide to view the full documentation and learn more about the features and capabilities of MDXTS.

## License

[MIT](/LICENSE.md) © [souporserious](https://souporserious.com/)
