import { MDXComponents } from 'mdxts/components'

import Changelog from '../../../packages/mdxts/CHANGELOG.md'

export default function Page() {
  return (
    <div
      className="prose"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.6rem',
      }}
    >
      <h1>Changelog</h1>
      <Changelog
        renderTitle={false}
        components={{
          pre: (props) => (
            // @ts-expect-error
            <MDXComponents.pre allowErrors {...props} />
          ),
        }}
      />
    </div>
  )
}
