import createMDXPlugin from '@next/mdx'
import { remarkPlugins, rehypePlugins } from 'renoun/mdx'
import { createServer } from 'renoun/server'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins,
    rehypePlugins,
    jsxImportSource: 'restyle',
  },
})

if (process.env.RENOUN_SERVER_STARTED !== 'true') {
  createServer()
  process.env.RENOUN_SERVER_STARTED = 'true'
}

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
