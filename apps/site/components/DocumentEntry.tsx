import type { EntryGroup, JavaScriptFileWithRuntime } from 'renoun/file-system'
import type { MDXContent, Headings } from 'renoun/mdx'

import { SiblingLink } from './SiblingLink'
import { TableOfContents } from './TableOfContents'

export async function DocumentEntry({
  file,
  entryGroup,
  shouldRenderTableOfContents = true,
  shouldRenderUpdatedAt = true,
}: {
  file: JavaScriptFileWithRuntime<{
    default: MDXContent
    headings: Headings
    metadata: {
      title: string
      description: string
    }
  }>
  entryGroup?: EntryGroup
  shouldRenderTableOfContents?: boolean
  shouldRenderUpdatedAt?: boolean
}) {
  const Content = await file.getExportValueOrThrow('default')
  const metadata = await file.getExportValueOrThrow('metadata')
  const headings = await file.getExportValueOrThrow('headings')
  const updatedAt = shouldRenderUpdatedAt ? await file.getUpdatedAt() : null
  const editPath = file.getEditPath()
  const [previousFile, nextFile] = await file.getSiblings({ entryGroup })

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
                css={{ fontWeight: 600 }}
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
            {previousFile ? (
              <SiblingLink
                entry={previousFile}
                direction="previous"
                variant="title"
              />
            ) : null}
            {nextFile ? (
              <SiblingLink entry={nextFile} direction="next" variant="title" />
            ) : null}
          </nav>
        </div>
      </div>

      {shouldRenderTableOfContents ? (
        <TableOfContents headings={headings} editPath={editPath} />
      ) : null}
    </>
  )
}
