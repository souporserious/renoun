import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DocsCollection, type DocsSource } from '@/collections'
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
        gap: '2rem',
        '@media (min-width: 768px)': {
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

        <div css={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '1rem',
              }}
            >
              {updatedAt ? (
                <div style={{ gridColumn: 1, textAlign: 'left' }}>
                  Last updated: {new Date(updatedAt).toLocaleString()}
                </div>
              ) : null}

              {editPath ? (
                <a
                  href={editPath}
                  style={{ gridColumn: 2, textAlign: 'right' }}
                >
                  Edit this page
                </a>
              ) : null}
            </div>

            <nav
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '1rem',
              }}
            >
              {previousSource ? (
                <SiblingLink source={previousSource} direction="previous" />
              ) : null}
              {nextSource ? (
                <SiblingLink source={nextSource} direction="next" />
              ) : null}
            </nav>
          </div>
        </div>
      </div>

      <aside>
        <TableOfContents headings={headings} />
      </aside>
    </div>
  )
}

async function SiblingLink({
  source,
  direction,
}: {
  source: DocsSource
  direction: 'previous' | 'next'
}) {
  return (
    <Link
      href={source.getPath()}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {source.getName()}
    </Link>
  )
}
