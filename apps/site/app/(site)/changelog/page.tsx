import { MDXComponents } from 'components/MDXComponents'
import Changelog from '../../../../../packages/renoun/CHANGELOG.md'

type CodeBlockProps = React.ComponentProps<typeof MDXComponents.CodeBlock>

export default function Page() {
  return (
    <main className="prose">
      <Changelog
        components={{
          ...MDXComponents,
          CodeBlock: (props: CodeBlockProps) => (
            <MDXComponents.CodeBlock
              allowErrors
              {...props}
              components={{
                ...props.components,
                Container: {
                  css: {
                    fontSize: 'var(--font-size-code-2)',
                    lineHeight: 'var(--line-height-code-2)',
                  },
                },
              }}
            />
          ),
        }}
      />
    </main>
  )
}
