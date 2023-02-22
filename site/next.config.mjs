import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  sources: {
    docs: {
      include: 'docs/**/*.(tsx|mdx)',
      loader: 'loaders/docs.ts',
    },
  },
})

export default withMDXTS({
  experimental: {
    appDir: true,
    esmExternals: 'loose',
  },
  compiler: {
    styledComponents: true,
  },
})
