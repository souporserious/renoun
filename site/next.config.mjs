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
    esmExternals: 'loose',
  },
  compiler: {
    styledComponents: true,
  },
  transpilePackages: ['@mdxts/react'],
})
