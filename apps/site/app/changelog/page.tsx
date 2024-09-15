import { MDXComponents } from 'renoun/components'

import Changelog from '../../../../packages/renoun/CHANGELOG.md'

export default function Page() {
  return (
    <div className="prose">
      <Changelog
        components={{
          pre: (props) => (
            // @ts-expect-error
            <MDXComponents.pre
              allowErrors
              {...props}
              style={{
                container: {
                  fontSize: 'var(--font-size-code)',
                  lineHeight: 'var(--line-height-code)',
                },
              }}
            />
          ),
        }}
      />
    </div>
  )
}
