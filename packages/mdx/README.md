# @renoun/mdx

A set of opinionated MDX plugins for `remark` and `rehype`.

## Installation

First, install `@renoun/mdx` using your preferred package manager:

```bash
npm install @renoun/mdx
```

## Usage

To use the plugins, you can add them to your MDX configuration. For example, in Next.js you can add the following to your `next.config.mjs`:

```js
import createMDXPlugin from '@next/mdx'
import { remarkPlugins, rehypePlugins } from '@renoun/mdx'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins,
    rehypePlugins,
  },
})

export default withMDX({
  output: 'export',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
})
```

## Customizing heading and section rendering

Headings are rendered through a `Heading` component so you can control anchors or styling via the MDX components provider. You can also provide a `Section` component to wrap each heading in a custom element (for example to attach context providers or use semantic `<section>` tags). By default, `Section` renders a `React.Fragment`.

```tsx
import type { MDXComponents } from 'mdx/types'

const components: MDXComponents = {
  Heading: ({ Tag, id, children }) => (
    <Tag id={id} className="heading-anchor">
      <a href={`#${id}`}>{children}</a>
    </Tag>
  ),
  Section: ({ id, depth, title, children }) => (
    <section id={id} aria-label={title} data-depth={depth}>
      {children}
    </section>
  ),
}

export default function Page({ Component, pageProps }) {
  return <Component {...pageProps} components={components} />
}
```

## License

[MIT](/LICENSE.md) © [souporserious](https://souporserious.com/)
