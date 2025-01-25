import { MDXComponents } from 'components/MDXComponents'
import Changelog from '../../../../../packages/renoun/CHANGELOG.md'

export default function Page() {
  return (
    <main className="prose">
      <Changelog
        components={{
          ...MDXComponents,
          pre: (props) => (
            <MDXComponents.pre
              allowErrors
              shouldFormat={false}
              {...props}
              style={{
                container: {
                  fontSize: 'var(--font-size-code-2)',
                  lineHeight: 'var(--line-height-code-2)',
                },
              }}
            />
          ),
        }}
      />
    </main>
  )
}
