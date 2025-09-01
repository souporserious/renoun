import { CodeBlock, parsePreProps, type MDXComponents } from 'renoun'

export function useMDXComponents() {
  return {
    pre: (props) => <CodeBlock {...parsePreProps(props)} />,
  } satisfies MDXComponents
}
