import type { Collection, MDXFile, MDXHeadings } from 'renoun'

import { SiblingLink } from './SiblingLink'
import { TableOfContents } from './TableOfContents'
import { ViewSource } from './ViewSource'

export async function DocumentEntry({
  file,
  collection,
  shouldRenderTableOfContents = true,
  shouldRenderUpdatedAt = true,
}: {
  file: MDXFile<{
    headings: MDXHeadings
    metadata: {
      title: string
      description: string
    }
  }>
  collection?: Collection<any>
  shouldRenderTableOfContents?: boolean
  shouldRenderUpdatedAt?: boolean
}) {
  const [Content, metadata, headings] = await Promise.all([
    file.getExportValue('default'),
    file.getExportValue('metadata'),
    file.getExportValue('headings'),
  ])
  const updatedAt = shouldRenderUpdatedAt
    ? await file.getLastCommitDate()
    : null
  let [previousEntry, nextEntry] = await file.getSiblings({ collection })

  if (previousEntry?.getBaseName() === 'docs') {
    previousEntry = undefined
  }

  return (
    <>
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4rem',
        }}
      >
        <div className="prose">
          <h1 css={{ fontSize: '3rem', margin: 0 }}>{metadata.title}</h1>
          {metadata.description ? <p>{metadata.description}</p> : null}
          <Content />
        </div>

        <div css={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {updatedAt ? (
            <div
              css={{
                fontSize: 'var(--font-size-body-3)',
                color: 'var(--color-foreground-secondary)',
              }}
            >
              Last updated{' '}
              <time
                dateTime={updatedAt.toString()}
                itemProp="dateModified"
                css={{ fontWeight: 'var(--font-weight-strong)' }}
              >
                {updatedAt.toLocaleString('en', {
                  year: '2-digit',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </time>
            </div>
          ) : null}

          <nav
            css={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2rem',
            }}
          >
            {previousEntry ? (
              <SiblingLink
                entry={previousEntry}
                direction="previous"
                variant="title"
              />
            ) : null}
            {nextEntry ? (
              <SiblingLink entry={nextEntry} direction="next" variant="title" />
            ) : null}
          </nav>
        </div>
      </div>

      {shouldRenderTableOfContents ? (
        <TableOfContents
          headings={headings}
          viewSource={<ViewSource source={file} />}
        />
      ) : null}
    </>
  )
}
