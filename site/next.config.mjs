import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  sources: {
    docs: 'docs/**/*.(tsx|mdx)',
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
