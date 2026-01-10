<div align="center">
  <a href="https://renoun.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/packages/renoun/images/logo-dark.png">
      <img src="/packages/renoun/images/logo-light.png" alt="renoun" width="180"/>
    </picture>
  </a>
  <h2>Query and Render Your Codebase</h2>
  <p>
     Turn your JavaScript, TypeScript, Markdown, and MDX<br>into reusable structured data for blogs, docs, and presentations<br>so your content always matches what’s in your codebase.
  </p>
</div>

<div align="center">
  <code>npx create-renoun@latest</code>
</div>

<br />

```tsx
import { Directory } from 'renoun'

const posts = new Directory({
  path: 'posts',
  loader: (path) => import(`./posts/${path}.mdx`),
})

async function Page({ slug }: { slug: string }) {
  const post = await posts.getFile(slug, 'mdx')
  const Content = await post.getContent()

  return <Content />
}
```

## Features

- Query files (MDX/MD/TS) like data
- Generate navigations/indexes from the file system
- Load and render module exports
- Validate frontmatter/exports with schemas

## Templates

The easiest way to get started using renoun is with an application template:

- **Blog** — blog starter with a post index, tags, and MDX article pages ([Demo](https://blog.renoun.dev) · [Source](/examples/blog))
- **Docs** — documentation starter that turns MDX content into a polished, full-featured site ([Demo](https://docs.renoun.dev) · [Source](/examples/docs))
- **Workbench** — design system workbench for building, previewing, and documenting libraries ([Demo](https://workbench.renoun.dev) · [Source](/examples/workbench))

## Why renoun?

Maintaining technical blogs, docs, and presentations is hard because the source of truth is split between content files, code, and examples causing drift. The renoun SDK turns your codebase into structured, queryable data (files, exports, types, and MDX) so you can render indexes, navigations, API references, and pages directly from what’s in the repo, keeping everything in sync as it changes.

## Contributing

See the [Contributing Guide](/CONTRIBUTING.md) for details on how to contribute to renoun.

## License

[MIT](/LICENSE.md) © [souporserious](https://souporserious.com/)
