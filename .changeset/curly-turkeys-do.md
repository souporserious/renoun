---
'mdxts': major
---

Removes `mdxts/next` package export. This is an effort to simplify the core package and reduce the number of dependencies. This functionality will be available in a separate package in the future.

### Breaking Changes

If using Next.js, this is a breaking change for users who are importing `mdxts/next` directly. The following configuration can be used to enable MDX support and silence warnings from the `ts-morph` dependency:

```ts
import createMDXPlugin from '@next/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import webpack from 'webpack'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
  },
})

export default withMDX({
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  webpack(config) {
    config.plugins.push(
      new webpack.ContextReplacementPlugin(
        /\/(@ts-morph\/common)\//,
        (data) => {
          for (const dependency of data.dependencies) {
            delete dependency.critical
          }
          return data
        }
      )
    )

    return config
  },
})
```

Then add or update the `mdx-components.tsx` file in the root of the project to set up the code components:

```tsx
import { MDXComponents } from 'mdx/types'
import { CodeBlock, CodeInline } from 'mdxts/components'

export function useMDXComponents() {
  return {
    code: (props) => {
      return (
        <CodeInline value={props.children as string} language="typescript" />
      )
    },
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock allowErrors value={value} language={language} />
    },
  } satisfies MDXComponents
}
```
