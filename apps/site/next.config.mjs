import createMDXPlugin from '@next/mdx'
import { remarkPlugins, rehypePlugins } from 'renoun/mdx'
import { startServer } from 'renoun/server'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins,
    rehypePlugins,
    jsxImportSource: 'restyle',
  },
})

await startServer()

export default withMDX({
  output: 'export',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  transpilePackages: ['renoun'],
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
})
