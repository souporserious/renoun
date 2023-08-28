import { getData } from 'mdxts'

export const allDocs = getData(require.context('./docs', true, /\.mdx$/))
