import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  types: ['react', 'mdxts/components'],
})

export default withMDXTS({
  compiler: {
    styledComponents: true,
  },
})
