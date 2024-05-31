import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'synthwave-84',
  gitSource: 'https://git.company.tld/souporserious/mdxts',
  gitProvider: 'gitlab',
})

export default withMdxts()
