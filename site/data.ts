import { getData } from 'mdxts'

const docsContext = require.context('./docs', true, /\.mdx$/)
const docsModules = Object.fromEntries(
  docsContext
    .keys()
    .filter((key) => !key.startsWith('./'))
    .map((key) => [key, docsContext(key)])
)
export const allDocs = getData(docsModules)

// function createData(filePattern: string, options?: { baseDir?: string }) {
//   const allData = {} as any
//   const baseDir = options?.baseDir || ''
//   return {
//     paths() {
//       Object.values(allData).map((data: any) =>
//         data.pathname.replace(baseDir, '')
//       )
//     },
//     get(pathname: string) {
//       return allData[pathname]
//     },
//   }
// }

// const allDocs = createData('**/*.mdx', { baseDir: './docs' })
// allDocs.paths() // ['getting-started']
// allDocs.get('getting-started')

// const allDocs = createData('./docs/**/*.mdx')
