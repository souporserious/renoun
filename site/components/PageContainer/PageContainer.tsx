import type { createSource } from 'mdxts'

import { SiblingLinks } from '../SiblingLinks'
import { TableOfContents } from '../TableOfContents'
import styles from './PageContainer.module.css'

export function PageContainer({
  children,
  dataSource,
}: {
  children: React.ReactNode
  dataSource: NonNullable<
    Awaited<ReturnType<ReturnType<typeof createSource>['get']>>
  >
}) {
  return (
    <div className={styles.container}>
      <div
        className="prose"
        style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}
      >
        {children}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            marginTop: '6rem',
          }}
        >
          <SiblingLinks previous={dataSource.previous} next={dataSource.next} />
        </div>
      </div>
      <TableOfContents
        headings={dataSource.headings}
        sourcePath={dataSource.sourcePath}
      />
    </div>
  )
}
