import type { MDXComponents } from 'mdx/types'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    Summary: (props) => <div {...props} />,
    ...components,
  }
}
