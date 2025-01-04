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
    - [Querying File System Entries](#querying-file-system-entries)
    - [Generating Navigations](#generating-navigations)
    - [Type Checking File Exports](#type-checking-file-exports)
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

Ensuring accurate, discoverable, and interactive content shouldn't be a chore. Creating high-quality technical content often involves juggling multiple tools and manual workflows. With **renoun**, you can streamline the entire process using a single toolkit built from the ground up for technical creators, using JavaScript and React.

At its core, renoun treats your content like an **interactive IDE**—all powered by an easy-to-use toolkit. Rather than displaying static text and code blocks, renoun’s React components and utilities help you seamlessly integrate live code examples, auto-generated API references, schema validation, and more. This approach not only keeps your content up-to-date, but also empowers deeper exploration of complex topics, inviting readers to engage with your content and documentation.

Here are just a few of the ways renoun enables you to deliver an engaging technical experience:

- **File System Utilities:** Easily query, type-check, and structure your content. By managing everything in a schema-driven way, large documentation sites or knowledge bases stay organized and maintainable.
- **Interactive Components:** Present your audience with live, syntax-highlighted code snippets and real-time feedback. Going beyond static code blocks, renoun’s IDE-like approach lets you embed interactive examples, creating a more rich learning experience.
- **API References:** Automatically pull in type information, signatures, and usage examples from your code. This eliminates duplication and ensures your documentation always reflects your codebase accurately.

Focus more on **what** you’re teaching and less on **how** to piece everything together. With the renoun toolkit, you have everything you need to build great technical content.

## Getting Started

```bash
npm install renoun
```

After installing the package, you can follow the [getting started guide](https://www.renoun.dev/docs/getting-started) or start creating content using your [favorite framework](https://www.renoun.dev/guides).

### File System

The File System API offers a way to organize and query file-system data in renoun. It is a powerful tool that allows you to define a schema for file exports and query those exports using a simple API.

To get started with the File System API, instantiate the `Directory` class to target a set of files and directories relative to the working directory:

```tsx
import { Directory } from 'renoun/file-system'

const posts = new Directory({ path: 'posts' })
```

#### Querying File System Entries

The directory class provides a set of methods to query file system entries. For example, to get a specific file, you can use the `getFile` method:

```tsx
import { Directory } from 'renoun/file-system'

const posts = new Directory({ path: 'posts' })

async function Page({ slug }: { slug: string }) {
  const post = await posts.getFile(slug, 'mdx')
  const Content = await post.getExportValue('default')

  return <Content />
}
```

The File System API works with [MDX](https://www.renoun.dev/guides/mdx) out-of-the-box. However, we can also specify a loader for how to resolve the `mdx` file extension's runtime that loads the module using your bundler:

```tsx
import { Directory } from 'renoun/file-system'

const posts = new Directory({
  path: 'posts',
  loaders: {
    mdx: (path) => import(`./posts/${path}.mdx`),
  },
})
```

> [!Note]
> Your bundler must be configured to load `mdx` extensions first for this to work.

Using your bundler to resolve the module ensures a consistent runtime environment and applies the same module resolution as your application.

#### Generating Navigations

You can also query all of the entries within the directory to help with generating navigations and index pages. For example, we can include only `mdx` file extensions to generate an index page of links to all posts using the `getEntries` method:

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

#### Type Checking File Exports

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
const file = await posts.getFile('hello-world', 'mdx')
const frontmatter = await file.getExportValue('frontmatter')

frontmatter.title // string
frontmatter.date // Date
```

Note, this does not affect the runtime behavior of the application and is purely for development-time type-checking. See the following section for runtime schema validation.

#### Schema Validation

You can also apply schema validation using libraries that follow the [Standard Schema Spec](https://github.com/standard-schema/standard-schema?tab=readme-ov-file#standard-schema-spec) like [Zod](https://zod.dev/), [Valibot](https://valibot.dev/), or [Arktype](https://github.com/arktypeio/arktype) to ensure file exports conform to a specific schema:

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
      <h2>{source.getBaseName()}</h2>
      <APIReference source={source} />
    </section>
  ))
}
```

---

The renoun toolkit offers many different components to help facilitate writing technical content. Visit the [components](https://www.renoun.dev/components) page to learn more.

## License

[AGPLv3](/LICENSE.md) © [souporserious](https://souporserious.com/)
