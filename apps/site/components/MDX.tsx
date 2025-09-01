import { MDX as DefaultMDX, remarkPlugins, rehypePlugins } from 'renoun'

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
