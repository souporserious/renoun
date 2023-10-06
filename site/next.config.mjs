import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  types: [
    'react',
    'mdxts/components',
    'mdxts/components/server',
    'mdxts/components/client',
    'mdxts/next',
    'mdxts/rehype',
    'mdxts/remark',
  ],
})

export default withMDXTS({
  compiler: {
    styledComponents: true,
  },
})
