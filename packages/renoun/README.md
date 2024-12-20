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

const posts = new Directory({
  path: 'posts',
  loaders: {
    mdx: (path) => import(`./posts/${path}.mdx`),
  },
})

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

  const Content = await post.getExportValue('default')

  return <Content />
}
```

#### Type checking file exports

To improve types, we can use the `withSchema` utility to define a schema for the file exports we expect to be exported from the file:

```tsx
import { Directory, withSchema } from 'renoun/file-system'

interface PostType {
  frontmatter: {
    title: string
    date: Date
  }
}

const posts = new Directory({
  path: 'posts',
  loaders: {
    mdx: withSchema<PostType>((path) => import(`./posts/${path}.mdx`)),
  },
})
```

Now when we call `getExportValue`, we will get better type checking and autocomplete.

#### Schema Validation

Alternatively to defining types in TypeScript, you can also use a schema library like [zod](https://zod.dev/), [valibot](https://valibot.dev/), or [arktype](https://github.com/arktypeio/arktype) to provide schema validation and transforms for the exports:

```tsx
import { Directory, withSchema } from 'renoun/file-system'
import { z } from 'zod'

const posts = new Directory({
  path: 'posts',
  loaders: {
    mdx: withSchema(
      {
        frontmatter: z.object({
          title: z.string(),
          date: z.date(),
        }),
      },
      (path) => import(`./posts/${path}.mdx`)
    ),
  },
})
```

You can also define a schema yourself using both TypeScript and custom validation functions:

```tsx
import { Directory, withSchema } from 'renoun/file-system'

const posts = new Directory({
  path: 'posts',
  loaders: {
    mdx: withSchema<{
      frontmatter: {
        title: string
        date: Date
      }
    }>(
      {
        frontmatter: (value) => {
          if (typeof value.title !== 'string') {
            throw new Error('Title is required')
          }

          if (!(value.date instanceof Date)) {
            throw new Error('Date is required')
          }

          return value
        },
      },
      (path) => import(`./posts/${path}.mdx`)
    ),
  },
})
```

#### Querying file system entries

You can query the entries within the directory to help with generating navigations and index pages. For example, we can include only `mdx` file extensions to generate an index page of links to all posts using the `getEntries` method:

```tsx
import { Directory, withSchema } from 'renoun/file-system'

interface PostType {
  frontmatter: {
    title: string
    date: Date
  }
}

const posts = new Directory({
  path: 'posts',
  include: '*.mdx',
  loaders: {
    mdx: withSchema<PostType>((path) => import(`./posts/${path}.mdx`)),
  },
})

export default async function Page() {
  const allPosts = await posts.getEntries()

  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts.map(async (post) => {
          const path = post.getPath()
          const frontmatter = await post.getExportValue('frontmatter')

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
