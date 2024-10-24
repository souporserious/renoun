<div align="center">
  <a href="https://renoun.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/packages/renoun/images/logo-dark.png">
      <img src="/packages/renoun/images/logo-light.png" alt="renoun" width="180"/>
    </picture>
  </a>
  <h2>Your Technical Content Toolkit</h2>
  <p>
Meticulously crafted React components and utilities to<br/>help you create engaging content and documentation.
  </p>
</div>

## Features

- 📝 Quickly start authoring technincal content
- 📊 Query file and directory metadata
- 🛟 Validate module exports
- 📘 Display API references
- 🌈 Accurately highlight code blocks
- ✅ Type-check code blocks
- 🖼️ Render source code examples

## Getting Started

```bash
npm install renoun
```

After installing the package, you can follow the [getting started guide](https://www.renoun.dev/docs/getting-started) or start creating content using your [favorite framework](https://www.renoun.dev/guides).

### Collections

Collections are a way to organize and query file-system data in renoun. They are a powerful tool that allows you to define a schema for file exports and query those exports using a simple API.

To get started with collections, instantiate the [`Collection`](https://www.renoun.dev/collections#collection) class to create a collection of files and directories from the file system:

```tsx
import { Collection } from 'renoun/collections'

const posts = new Collection({ filePattern: 'posts/*.mdx' })

export default async function Page({ params }: { params: { slug: string } }) {
  const post = await posts.getSource(params.slug)

  if (!post) {
    return <div>Post not found</div>
  }

  const Content = await post.getExport('default').getValue()

  return <Content />
}
```

Collections are not limited to MDX files and can be used with _any file type_. By organizing content and source code into structured collections, we can easily generate static pages and manage complex routing and navigations.

For a more in-depth look at collections, visit the [collections](https://www.renoun.dev/collections) page.

### Components

Quickly build interactive and engaging content and documentation with renoun’s powerful set of React components.

#### Syntax Highlighting

Use the [`CodeBlock`](https://www.renoun.dev/components/code-block) component to render syntax-highlighted code blocks:

```tsx
import { CodeBlock } from 'renoun/components'

export default function Page() {
  return <CodeBlock language="jsx" value={`<div>Hello, world!</div>`} />
}
```

Or take full control of the highlighting process with the `Tokens` component:

```tsx
import { CodeBlock, Tokens } from 'renoun/components'

export default function Page() {
  return (
    <CodeBlock language="jsx" value={`<div>Hello, world!</div>`}>
      <pre>
        <Tokens />
      </pre>
    </CodeBlock>
  )
}
```

#### API References

Quickly document your APIs with renoun’s [`APIReference`](https://www.renoun.dev/components/api-reference) component:

```tsx
import { APIReference } from 'renoun/components'

export default function Page() {
  return <APIReference source="src/components/Button.tsx" />
}
```

API references can also be resolved from a `Collection` source. This can be from a file that will include references for all exports:

```tsx
import { Collection } from 'renoun/collections'
import { APIReference } from 'renoun/components'

const components = new Collection({ filePattern: 'components/*.tsx' })

export default async function Page({ params }: { params: { slug: string } }) {
  const component = await components.getSource(params.slug)

  if (!component) {
    return <div>Component not found</div>
  }

  return <APIReference source={component} />
}
```

Or from a specific export within a file:

```tsx
import { Collection } from 'renoun/collections'
import { APIReference } from 'renoun/components'

const components = new Collection({ filePattern: 'components/*.tsx' })

export default async function Page({ params }: { params: { slug: string } }) {
  const component = await components.getSource(params.slug)

  if (!component) {
    return <div>Component not found</div>
  }

  const componentExports = component.getExports()

  return componentExports.map((source) => (
    <section>
      <h2>{source.getName()}</h2>
      <APIReference source={source} />
    </section>
  ))
}
```

---

The renoun toolkit offers many different components to help facilitate writing technical content. Visit the [components](https://www.renoun.dev/components) page to learn more.

## License

[AGPLv3](/LICENSE.md) © [souporserious](https://souporserious.com/)
