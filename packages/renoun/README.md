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

- [Features](#features)
- [Why renoun?](#why-renoun)
- [Getting Started](#getting-started)
  - [File System](#file-system)
    - [Querying file system entries](#querying-file-system-entries)
    - [Type checking file exports](#type-checking-file-exports)
    - [Schema Validation](#schema-validation)
  - [Components](#components)
    - [Syntax Highlighting](#syntax-highlighting)
    - [API References](#api-references)

## Features

- 📝 Quickly start authoring MDX content
- 📊 Analyze and query file system metadata
- 🛟 Validate JavaScript module exports
- 📘 Generate JavaScript API references
- 🌈 Accurately highlight code blocks
- ✅ Type-check JavaScript code blocks
- 🖼️ Render source code examples

## Why renoun?

The renoun toolkit simplifies the creation of engaging and comprehensive content and documentation. By offering a robust set of utilities and React components, renoun enables you to:

- **Organize and Query File System Data:** Easily query and render structured data from your file system.
- **Validate JavaScript Module Exports:** Ensure your modules are correctly exported and maintain type safety.
- **Render Interactive Documentation:** Build dynamic and user-friendly documentation using React.

Whether you're authoring technical articles, generating API references, or managing extensive documentation, renoun provides the tools you need to quickly and easily create polished and interactive content.

## Getting Started

```bash
npm install renoun
```

After installing the package, you can follow the [getting started guide](https://www.renoun.dev/docs/getting-started) or start creating content using your [favorite framework](https://www.renoun.dev/guides).

### File System

The File System API offers a way to organize and query file-system data in renoun. It is a powerful tool that allows you to define a schema for file exports and query those exports using a simple API.

To get started with the File System API, instantiate the `Directory` class to target a set of files and directories from the file system. You can then use the `getEntry` / `getDirectory` / `getFile` methods to query a specific descendant file or directory:

```tsx
import { Directory } from 'renoun/file-system'

const posts = new Directory({
  path: 'posts',
  loaders: {
    mdx: (path) => import(`./posts/${path}.mdx`),
  },
})
```

Here we are creating a new `Directory` instance that targets the `posts` directory relative to the working directory. We are also specifying a loader for the `mdx` file extension that will be used to load the file contents using the bundler.

#### Querying file system entries

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

#### Type checking file exports

To improve type safety, you can utilize the `withSchema` helper to specify the schema for the file’s exports:

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

Now when calling `JavaScript#getExportValue` and `JavaScriptExport#getRuntimeValue` we get stronger type-checking and autocompletion:

```tsx
const file = await posts.getFileOrThrow('hello-world', 'mdx')
const frontmatter = await file.getExportValueOrThrow('frontmatter')

frontmatter.title // string
frontmatter.date // Date
```

#### Schema Validation

You can also apply schema validation using libraries that follow the [Standard Schema Spect](https://github.com/standard-schema/standard-schema?tab=readme-ov-file#standard-schema-spec) like [Zod](https://zod.dev/), [Valibot](https://valibot.dev/), or [Arktype](https://github.com/arktypeio/arktype) to ensure file exports conform to a specific schema:

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

Alternatively, you can define a schema yourself using both TypeScript types and custom validation functions:

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
    mdx: withSchema<PostType>(
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
