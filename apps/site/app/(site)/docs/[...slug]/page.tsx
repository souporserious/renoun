import { notFound } from 'next/navigation'

import { DocsCollection } from '@/collections'
import { SiblingLink } from '@/components/SiblingLink'
import { TableOfContents } from '@/components/TableOfContents'

export async function generateStaticParams() {
  const sources = await DocsCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
}

export default async function Doc({ params }: { params: { slug: string[] } }) {
  const docSource = DocsCollection.getSource(['docs', ...params.slug])

  if (!docSource) {
    notFound()
  }

  const Content = await docSource.getDefaultExport().getValue()
  const metadata = await docSource.getNamedExport('metadata').getValue()
  const headings = await docSource.getNamedExport('headings').getValue()
  const updatedAt = await docSource.getUpdatedAt()
  const editPath = docSource.getEditPath()
  const [previousSource, nextSource] = await docSource.getSiblings({
    depth: 0,
  })

  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '4rem',

        '@media screen and (min-width: 60rem)': {
          gridTemplateColumns: 'minmax(0, 1fr) 12rem',
        },
      }}
    >
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4rem',
        }}
      >
        <div className="prose">
          <h1 css={{ fontSize: '3rem', margin: 0 }}>{metadata.title}</h1>
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
            {previousSource ? (
              <SiblingLink
                source={previousSource}
                direction="previous"
                variant="title"
              />
            ) : null}
            {nextSource ? (
              <SiblingLink
                source={nextSource}
                direction="next"
                variant="title"
              />
            ) : null}
          </nav>
        </div>
      </div>

      <TableOfContents headings={headings} editPath={editPath} />
    </div>
  )
}
