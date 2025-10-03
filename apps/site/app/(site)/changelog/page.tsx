import { MDXComponents } from 'components/MDXComponents'
import Changelog from '../../../../../packages/renoun/CHANGELOG.md'

export default function Page() {
  return (
    <main className="prose">
      <Changelog
        components={{
          ...MDXComponents,
          CodeBlock: ({ components, ...props }) => (
            <MDXComponents.CodeBlock
              allowErrors
              {...props}
              components={{
                Container: ({ children, className }) => (
                  <div
                    className={className}
                    style={{
                      fontSize: 'var(--font-size-code-2)',
                      lineHeight: 'var(--line-height-code-2)',
                    }}
                  >
                    {children}
                  </div>
                ),
                ...components,
              }}
            />
          ),
        }}
      />
    </main>
  )
}
