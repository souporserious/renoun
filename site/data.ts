import { getData } from 'mdxts'

const docsContext = require.context('./docs', true, /\.mdx$/)
const docsModules = Object.fromEntries(
  docsContext.keys().map((key) => [key, docsContext(key)])
)
export const allDocs = getData(docsModules)
