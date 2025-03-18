import createMDXPlugin from '@next/mdx'
import { remarkPlugins, rehypePlugins } from 'renoun/mdx'

const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins,
    rehypePlugins,
    jsxImportSource: 'restyle',
  },
})

export default withMDX({
  images: { unoptimized: true },
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
