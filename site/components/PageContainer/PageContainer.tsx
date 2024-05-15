import type { createSource } from 'mdxts'

import { SiblingLinks } from '../SiblingLinks'
import { TableOfContents } from '../TableOfContents'
import styles from './PageContainer.module.css'

export function PageContainer({
  children,
  dataSource,
  viewSource = true,
}: {
  children: React.ReactNode
  dataSource: NonNullable<
    Awaited<ReturnType<ReturnType<typeof createSource>['get']>>
  >
  viewSource?: boolean
}) {
  return (
    <div className={styles.container}>
      <div
        className="prose"
        style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}
      >
        {children}
        <div style={{ flex: '1 1 6rem' }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem',
          }}
        >
          {dataSource.updatedAt ? (
            <div
              style={{
                fontSize: 'var(--font-size-body-3)',
                color: 'var(--color-foreground-secondary)',
                textAlign: 'end',
              }}
            >
              Last updated{' '}
              <time
                dateTime={dataSource.updatedAt}
                itemProp="dateModified"
                style={{ fontWeight: 600 }}
              >
                {new Date(dataSource.updatedAt).toLocaleString('en', {
                  year: '2-digit',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </time>
            </div>
          ) : null}
          <SiblingLinks previous={dataSource.previous} next={dataSource.next} />
        </div>
      </div>
      <TableOfContents
        headings={dataSource.headings}
        sourcePath={viewSource ? dataSource.sourcePath : undefined}
      />
    </div>
  )
}
