import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'theme.json',
  gitSource: 'https://github.com/souporserious/mdxts',
  siteUrl: 'https://www.mdxts.dev',
})

export default withMdxts({
  // output: 'export',
})
