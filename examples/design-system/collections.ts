import { Directory } from 'renoun/file-system'

export const ComponentsCollection = new Directory({
  path: 'components',
  loader: {
    ts: (path) => import(`./components/${path}.ts`),
    tsx: (path) => import(`./components/${path}.tsx`),
    mdx: (path) => import(`./components/${path}.mdx`),
  },
})
