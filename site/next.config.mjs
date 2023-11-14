import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  types: [
    'react',
    'mdxts',
    'mdxts/components',
    'mdxts/components/client',
    'mdxts/next',
    'mdxts/rehype',
    'mdxts/remark',
  ],
})

export default withMdxts({
  compiler: {
    styledComponents: true,
  },
})
