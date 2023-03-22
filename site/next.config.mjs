import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  sources: {
    docs: 'docs/**/*.(tsx|mdx)',
  },
})

export default withMDXTS({
  compiler: {
    styledComponents: true,
  },
  experimental: {
    appDir: true,
    esmExternals: 'loose',
  },
  transpilePackages: ['@mdxts/code', '@mdxts/editor', '@mdxts/live'],
  output: 'standalone',
})
