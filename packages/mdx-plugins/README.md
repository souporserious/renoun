# @renoun/mdx-plugins

A set of opinionated MDX plugins for `remark` and `rehype`.

## Installation

First, install `@renoun/mdx-plugins` using your preferred package manager:

```bash
npm install @renoun/mdx-plugins
```

## Usage

To use the plugins, you can add them to your MDX configuration. For example, in Next.js you can add the following to your `next.config.mjs`:

```js
import createMDXPlugin from '@next/mdx'
import { remarkPlugins, rehypePlugins } from '@renoun/mdx-plugins'

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

## License

[MIT](/LICENSE.md) © [souporserious](https://souporserious.com/)
