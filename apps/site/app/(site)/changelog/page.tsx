import { MDXComponents } from 'renoun/components'

import Changelog from '../../../../../packages/renoun/CHANGELOG.md'

export default function Page() {
  return (
    <main className="prose">
      <Changelog
        components={{
          pre: (props) => (
            // @ts-expect-error
            <MDXComponents.pre
              allowErrors
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
