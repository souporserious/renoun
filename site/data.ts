import { loadModules } from 'mdxts'

export const allDocs = loadModules(
  require.context('./docs', true, /\.mdx$/, 'lazy'),
  'docs'
)
