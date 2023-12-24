import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts',
  types: ['react', 'mdxts', 'mdxts/components', 'mdxts/next'],
})

export default withMdxts({
  compiler: {
    styledComponents: true,
  },
})
