import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  types: ['react'],
})

export default withMDXTS({
  transpilePackages: ['mdxts'],
  compiler: {
    styledComponents: true,
  },
})
