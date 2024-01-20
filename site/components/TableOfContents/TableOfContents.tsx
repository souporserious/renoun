import type { Headings } from 'mdxts/dist/remark/add-headings'
import { ViewSource } from '../ViewSource'
import styles from './TableOfContents.module.css'

export function TableOfContents({
  headings,
  sourcePath,
}: {
  headings: Headings
  sourcePath: string
}) {
  return (
    <nav className={styles.container}>
      <ul
        style={{
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          margin: 0,
          marginTop: 'calc(var(--font-size-heading-1) + 1rem)',
          position: 'sticky',
          top: '2rem',
        }}
      >
        <li style={{ padding: '0.25rem 0px', marginBottom: '0.5rem' }}>
          <h4 className="title">On this page</h4>
        </li>
        {headings?.map(({ text, depth, id }) =>
          depth > 1 ? (
            <li
              key={id}
              style={{
                fontSize: 'var(--font-size-body-3)',
                padding: '0.25rem 0',
                paddingLeft: (depth - 2) * 0.8 + 'rem',
              }}
            >
              <a href={`#${id}`}>{text}</a>
            </li>
          ) : null
        )}
        {sourcePath ? (
          <>
            <li style={{ margin: '0.8rem 0' }}>
              <hr
                style={{
                  border: 'none',
                  height: 1,
                  backgroundColor: 'var(--color-separator)',
                }}
              />
            </li>
            <li>
              <ViewSource href={sourcePath} />
            </li>
          </>
        ) : null}
      </ul>
    </nav>
  )
}
