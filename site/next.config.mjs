import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts',
})

export default withMdxts({
  compiler: {
    styledComponents: true,
  },
  output: 'export',
})
