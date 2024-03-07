import { createSource } from 'mdxts'

export const posts = createSource<{
  metadata: { date: string }
}>('./*.mdx', {
  baseDirectory: 'app',
})
