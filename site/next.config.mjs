import { createMDXTSPlugin } from 'mdxts/next'

const withMDXTS = createMDXTSPlugin({
  docs: {
    include: 'docs/**/*.mdx',
    loader: 'loaders/docs.ts',
  },
})

export default withMDXTS({
  experimental: {
    appDir: true,
  },
  compiler: {
    styledComponents: true,
  },
})
