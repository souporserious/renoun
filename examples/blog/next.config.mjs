import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'nord',
  gitSource: 'https://github.com/souporserious/mdxts',
})

export default withMdxts()
