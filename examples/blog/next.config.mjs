// import { createMdxtsPlugin } from 'mdxts/next'

// const withMdxts = createMdxtsPlugin({
//   theme: 'nord',
//   gitSource: 'https://github.com/souporserious/mdxts',
// })

// export default withMdxts({
//   // output: 'export',
// })

import createMDXPlugin from '@next/mdx'
import webpack from 'webpack'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
  },
})

export default withMDX({
  transpilePackages: ['project'],
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
      ),
      new webpack.IgnorePlugin({
        resourceRegExp: /^perf_hooks$/,
      })
    )
    return config
  },
})
