import {
  createCollection,
  type MDXContent,
  type FileSystemSource,
} from 'mdxts/collections'

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = createCollection<ComponentSchema>(
  '@/components/**/{index,*.examples}.{ts,tsx}',
  {
    baseDirectory: 'components',
    basePath: 'components',
  }
)

export type PostSchema = {
  default: MDXContent
  frontmatter?: {
    title: string
    description: string
  }
}

export type PostSource = FileSystemSource<PostSchema>

export const PostsCollection = createCollection<PostSchema>(
  '@/posts/**/*.{ts,mdx}',
  {
    title: 'Posts',
    baseDirectory: 'posts',
    basePath: 'posts', // TODO: test this works without specifying
  }
)
