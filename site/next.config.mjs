import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
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
