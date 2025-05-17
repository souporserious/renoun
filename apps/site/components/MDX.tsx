import { MDX as DefaultMDX } from 'renoun/components'
import { remarkPlugins, rehypePlugins } from 'renoun/mdx'

import { MDXComponents } from '@/components/MDXComponents'

export function MDX({ children }: { children: string }) {
  return (
    <DefaultMDX
      components={MDXComponents}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      children={children}
    />
  )
}
