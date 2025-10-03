import { Code, type MDXComponents } from 'renoun'

export function useMDXComponents() {
  return {
    pre: (props) => <Code {...props} />,
  } satisfies MDXComponents
}
