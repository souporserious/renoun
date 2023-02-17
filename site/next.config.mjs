import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  gitSource: 'https://github.com/souporserious/mdxts/tree/main',
  sources: {
    docs: {
      include: 'docs/**/*.mdx',
      loader: 'loaders/docs.ts',
    },
    react: {
      include: '../packages/react/src/**/*.(ts|tsx|mdx)',
      loader: 'loaders/react.ts',
    },
  },
})

export default withMDXTS({
  experimental: {
    appDir: true,
    esmExternals: 'loose',
  },
  compiler: {
    styledComponents: true,
  },
  target: 'serverless',
})
