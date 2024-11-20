import { Directory, isFileWithExtension } from 'renoun/file-system'
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
  schema: { mdx: { frontmatter: frontmatterSchema.parse } },
  getModule: (path) => import(`./posts/${path}`),
})
  .filter((entry) => isFileWithExtension(entry, 'mdx'))
  .sort(async (a, b) => {
    const aFrontmatter = await a.getExport('frontmatter').getRuntimeValue()
    const bFrontmatter = await b.getExport('frontmatter').getRuntimeValue()

    return bFrontmatter.date.getTime() - aFrontmatter.date.getTime()
  })
