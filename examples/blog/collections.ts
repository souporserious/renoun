import { Directory, isFile } from 'renoun/file-system'
import type { MDXContent } from 'renoun/mdx'
import { z } from 'zod'

const frontmatterSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

interface PostType {
  default: MDXContent
  frontmatter: z.infer<typeof frontmatterSchema>
}

export const posts = new Directory<{ mdx: PostType }>({
  path: 'posts',
})
  .withSchema('mdx', { frontmatter: frontmatterSchema.parse })
  .withModule((path) => import(`./posts/${path}`))
  .withFilter((entry) => isFile(entry, 'mdx'))
  .withSort(async (a, b) => {
    const aFrontmatter = await a.getExport('frontmatter').getRuntimeValue()
    const bFrontmatter = await b.getExport('frontmatter').getRuntimeValue()

    return bFrontmatter.date.getTime() - aFrontmatter.date.getTime()
  })
