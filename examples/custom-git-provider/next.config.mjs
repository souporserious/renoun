import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'nord',
  gitSource: 'https://git.company.tld/souporserious/mdxts',
  gitProvider: 'gitlab'
})

export default withMdxts({
  output: 'export',
})
