<div align="center">
  <a href="https://renoun.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/packages/renoun/images/logo-dark.png">
      <img src="/packages/renoun/images/logo-light.png" alt="renoun" width="180"/>
    </picture>
  </a>
  <h2>Create Engaging Content and Documentation</h2>
  <p>
Meticulously crafted React components and utilities to<br/>help you author technical content and documentation.
  </p>
</div>

## Features

- 📝 Quickly start authoring MDX content
- 📊 Analyze and query file system metadata
- 🛟 Validate JavaScript module exports
- 📘 Generate JavaScript API references
- 🌈 Accurately highlight code blocks
- ✅ Type-check JavaScript code blocks
- 🖼️ Render source code examples

## Getting Started

```bash
npm install renoun
```

After installing the package, you can follow the [getting started guide](https://www.renoun.dev/docs/getting-started) or start creating content using your [favorite framework](https://www.renoun.dev/guides).

### File System

The File System API offers a way to organize and query file-system data in renoun. It is a powerful tool that allows you to define a schema for file exports and query those exports using a simple API.

To get started with the File System API, instantiate the `Directory` class to target a set of files and directories from the file system. We can then use the `getEntry` / `getDirectory` / `getFile` methods to query a specific file or directory:

```tsx
import { Directory } from 'renoun/file-system'

const posts = new Directory('posts').withModule(
  (path) => import(`posts/${path}`)
)

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug
  const post = await posts.getFile(slug, 'mdx')

  if (!post) {
    return <div>Post not found</div>
  }

  const Content = await post.getExportValueOrThrow('default')

  return <Content />
}
```

Right now we aren't getting the best type checking from the `getExport` method. We can improve this by providing the types we expect for this extension to the `Directory` class:

```tsx
import { Directory } from 'renoun/file-system'
import type { MDXContent } from 'renoun/mdx'

interface PostTypes {
  mdx: {
    default: MDXContent
    frontmatter: { title: string; date: Date }
  }
}

const posts = new Directory<PostTypes>('posts').withModule(
  (path) => import(`posts/${path}`)
)
```

Now when we call `getExport`, we will get better type checking and intellisense.

Next, we can generate an index page of links to all posts using the `getEntries` method. We'll also add types for the incoming front matter that we are expecting from enabling [frontmatter](https://www.renoun.dev/guides/mdx#remark-frontmatter) from `renoun/mdx`:

```tsx
import { Directory, isFile } from 'renoun/file-system'
import type { MDXContent } from 'renoun/mdx'

interface PostTypes {
  mdx: {
    default: MDXContent
    frontmatter: { title: string; date: Date }
  }
}

const posts = new Directory<PostTypes>('posts').withModule(
  (path) => import(`posts/${path}`)
)

export default async function Page() {
  const allPosts = await posts
    .withFilter((post) => isFile(post, 'mdx'))
    .getEntries()

  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts.map(async (post) => {
          const path = post.getPath()
          const frontmatter = await post.getExportValueOrThrow('frontmatter')

          return (
            <li key={path}>
              <a href={path}>{frontmatter.title}</a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
```

To further improve the types we can also provide [schema validation](https://www.renoun.dev/docs/getting-started#validating-exports) to ensure that modules export the correct shape.

The file system utilities are not limited to MDX files and can be used with _any file type_. By organizing content and source code into structured collections, you can easily generate static pages and manage complex routing and navigations. For a more in-depth look at the file system utilities, visit the [docs site](https://www.renoun.dev/).

### Components

Quickly build interactive and engaging documentation with renoun’s powerful set of React components.

#### Syntax Highlighting

Use the [`CodeBlock`](https://www.renoun.dev/components/code-block) component to render syntax-highlighted code blocks:

```tsx
import { CodeBlock } from 'renoun/components'

export default function Page() {
  return <CodeBlock language="jsx" value={`<div>Hello, world!</div>`} />
}
```

Or take full control of the highlighting process by using the [`Tokens`](https://www.renoun.dev/components/code-block/tokens) component and related components like [`LineNumbers`](https://www.renoun.dev/components/code-block/line-numbers) and [`Toolbar`](https://www.renoun.dev/components/code-block/toolbar):

```tsx
import { CodeBlock, LineNumbers, Tokens, Toolbar } from 'renoun/components'

export default function Page() {
  return (
    <CodeBlock language="jsx" value={`<div>Hello, world!</div>`}>
      <div
        style={{
          fontSize: '1rem',
          borderRadius: '0.25rem',
          boxShadow: '0 0 0 1px var(--color-separator)',
        }}
      >
        <Toolbar
          allowCopy
          css={{
            padding: '0.5lh',
            boxShadow: 'inset 0 -1px 0 0 var(--color-separator)',
          }}
        />
        <pre
          style={{
            display: 'grid',
            gridTemplateColumns: 'min-content max-content',
            padding: '0.5lh 0',
            lineHeight: 1.4,
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            overflow: 'auto',
          }}
        >
          <LineNumbers css={{ padding: '0 0.5lh' }} />
          <code style={{ paddingRight: '0.5lh' }}>
            <Tokens />
          </code>
        </pre>
      </div>
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

API references can also be resolved from a `File` that will include references for all exports:

```tsx
import { Directory } from 'renoun/file-system'
import { APIReference } from 'renoun/components'

const components = new Directory({ path: 'components' })

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const component = await components.getFile((await params).slug, 'tsx')

  if (!component) {
    return <div>Component not found</div>
  }

  return <APIReference source={component} />
}
```

Or from a specific exports within a `File`:

```tsx
import { Directory } from 'renoun/file-system'
import { APIReference } from 'renoun/components'

const components = new Directory({ filePattern: 'components' })

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const component = await components.getFile((await params).slug, 'tsx')

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
