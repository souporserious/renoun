<div align="center">
  <a href="https://renoun.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/packages/renoun/images/logo-dark.png">
      <img src="/packages/renoun/images/logo-light.png" alt="renoun" width="180"/>
    </picture>
  </a>
  <h2>Elevate Your Design System Docs</h2>
  <p>
    The renoun toolkit uses your React framework to keep<br>documentation polished, in sync, and on brand.
  </p>
</div>

<div align="center">
  <code>npx create-renoun@latest</code>
</div>

<br />

- [Features](#features)
- [Why renoun?](#why-renoun)
- [Getting Started](#getting-started)
  - [Install](#install)
    - [Automated Setup](#automated-setup)
    - [Manual Setup](#manual-setup)
  - [Components](#components)
    - [Syntax Highlighting](#syntax-highlighting)
    - [API References](#api-references)
  - [Utilities](#utilities)
    - [Querying File System Entries](#querying-file-system-entries)
    - [Generating Navigations](#generating-navigations)
    - [Type Checking File Exports](#type-checking-file-exports)
    - [Schema Validation](#schema-validation)
- [Contributing](#contributing)
- [License](#license)

## Features

- 📝 Author MDX content in seconds
- 📊 Query and analyze file system metadata
- 🛟 Validate module exports
- 📘 Generate up‑to‑date API references
- 🌈 Highlight code with precision
- ✅ Type‑check code blocks
- 🖼️ Render source code examples
- 📦 Integrate with your favorite framework

## Why renoun?

Maintaining consistent technical documentation at scale is hard, especially for design systems. The renoun toolkit simplifies this by providing a React‑first solution to author, validate, and render documentation that stays in sync with your code every step of the way.

### Designed for React Developers

Built from the ground up for React, renoun gives you the full power of composition and templating making it easy to create interactive and engaging documentation suited exactly to your needs.

#### Drop‑In Components

Quickly get started with powerful components like [`APIReference`](https://www.renoun.dev/components/api-reference), [`CodeBlock`](https://www.renoun.dev/components/code-block), [`MDX`](https://www.renoun.dev/components/mdx), and more — no extra setup required.

[Explore components →](https://www.renoun.dev/components)

#### Type‑Safe MDX Content

Define front matter schemas using TypeScript, Arktype, Valibot, or Zod ensuring you catch mismatched data and invalid exports at compile time.

[Learn about schemas →](https://www.renoun.dev/guides/zod)

#### File System Utilities

Easily query file system entries, generate navigations, and validate JavaScript module exports using a simple API. The file system utilities are not limited to MDX files and can be used with any file type.

[Explore file system utilities →](https://www.renoun.dev/utilities/file-system)

#### Automated API References

Effortlessly generate accurate, up‑to‑date API references, including type signatures and prop tables directly from your source code.

[Try the `APIReference` component →](https://www.renoun.dev/components/api-reference)

#### Customizable Theming

Easily enable multiple themes for light and dark mode, extend functionality through plugins, or fully override styles using an expanding ecosystem of utilities, aligning your docs precisely with your brand.

[Learn about configuration →](https://www.renoun.dev/docs/configuration)

## Getting Started

Whether you’re building a new design system or enhancing an existing library, renoun provides everything you need to create beautiful, interactive documentation that scales with your team.

### Install

To get started with renoun, you can either use an automated setup starting from an [example](/examples) or install the package manually. The automated setup is the easiest way to get started, while the manual setup gives you full control over the installation process.

#### Automated Setup

To create a new project or add to an existing project, run the following command in your terminal:

```bash
npx create-renoun@latest
```

This will prompt you to select an [example](/examples/) to install. Once the installation is complete, you can start your development server:

```bash
npm run dev
```

#### Manual Setup

If you prefer to set up renoun manually, you can install the package directly into your existing project. This is useful if you want to integrate renoun into an existing codebase or if you want to customize the setup process.

To install renoun, run the following command in your terminal:

```bash
npm install renoun
```

After installing the package, you can follow the [getting started guide](https://www.renoun.dev/docs/getting-started) or start creating content using your [favorite framework](https://www.renoun.dev/guides).

### Components

Quickly build interactive and engaging documentation with renoun’s powerful set of React components.

#### Syntax Highlighting

Use the [`CodeBlock`](https://www.renoun.dev/components/code-block) component to render syntax-highlighted code blocks:

```tsx
import { CodeBlock } from 'renoun/components'

export default function Page() {
  return <CodeBlock language="jsx">{`<div>Hello, world!</div>`}</CodeBlock>
}
```

Or take full control of the highlighting process by using the [`Tokens`](https://www.renoun.dev/components/code-block/tokens) component and related components like [`LineNumbers`](https://www.renoun.dev/components/code-block/line-numbers) and [`Toolbar`](https://www.renoun.dev/components/code-block/toolbar):

```tsx
import { CodeBlock, LineNumbers, Tokens, Toolbar } from 'renoun/components'

export default function Page() {
  return (
    <CodeBlock language="jsx">
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
            <Tokens>{`<div>Hello, world!</div>`}</Tokens>
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
  const { slug } = await params
  const component = await components.getFile(slug, 'tsx')

  return <APIReference source={component} />
}
```

Or from a specific exports within a `File`:

```tsx
import { Directory } from 'renoun/file-system'
import { APIReference } from 'renoun/components'

const components = new Directory({ path: 'components' })

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const component = await components.getFile(slug, 'tsx')
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

### Utilities

The File System utilities offer a way to organize and query file-system data in renoun. It is a powerful tool that allows you to define a schema for file exports and query those exports using a simple API.

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

The File System utilities work with [MDX](https://www.renoun.dev/guides/mdx) out-of-the-box. However, we can also specify a loader for how to resolve the `mdx` file extension's runtime that loads the module using your bundler:

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
import { Directory } from 'renoun/file-system'

const posts = new Directory({
  path: 'posts',
  include: '*.mdx',
})

export default async function Page() {
  const allPosts = await posts.getEntries()

  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPosts.map(async (post) => {
          const pathname = post.getPathname()
          const frontmatter = await post.getExportValue('frontmatter')

          return (
            <li key={pathname}>
              <a href={pathname}>{frontmatter.title}</a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
```

The `include` filter will affect the results of the `getEntries` method, returning only entries that match the specified pattern. Specific files or directories are still accessible using the `getFile` and `getDirectory` methods.

#### Type Checking File Exports

To improve type safety, you can utilize the `withSchema` helper to specify a schema for the file’s expected exports:

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

## Contributing

See the [Contributing Guide](/CONTRIBUTING.md) for details on how to contribute to renoun.

## License

The renoun source code is provided under the non-commercial [renoun license](/LICENSE.md) ideal for blogs, documentation sites, and educational content. If you plan to integrate renoun into a commercial product or service, reach out to sales@souporserious.com to discuss options.

© [souporserious LLC](https://souporserious.com/)
