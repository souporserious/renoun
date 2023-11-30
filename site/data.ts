import { loadModules } from 'mdxts'

export const allDocs = loadModules(
  require.context('./docs', true, /\.mdx$/, 'lazy'),
  'docs'
)

export const allComponents = loadModules(
  require.context('./components', true, /README\.mdx$/, 'lazy')
)

// TODO: Add support for merging data from multiple sources
// export const allDocs = createData('./docs/**/README.mdx')
// export const allComponents = createData('./components/**/README.mdx')
// export const allData = createData(allDocs, allComponents)
