import Link from 'next/link'
import { notFound } from 'next/navigation'
import { styled } from 'restyle'

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

        <div css={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '1rem',
            }}
          >
            {updatedAt ? (
              <div
                style={{
                  gridColumn: 1,
                  fontSize: 'var(--font-size-body-3)',
                  color: 'var(--color-foreground-secondary)',
                  textAlign: 'left',
                }}
              >
                Last updated{' '}
                <time
                  dateTime={updatedAt.toString()}
                  itemProp="dateModified"
                  style={{ fontWeight: 600 }}
                >
                  {updatedAt.toLocaleString('en', {
                    year: '2-digit',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </time>
              </div>
            ) : null}

            {editPath ? (
              <a href={editPath} style={{ gridColumn: 2, textAlign: 'right' }}>
                Edit this page
              </a>
            ) : null}
          </div>

          <nav
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2rem',
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

      <aside>
        <TableOfContents headings={headings} />
      </aside>
    </div>
  )
}

const StyledLink = styled(Link, {
  fontSize: 'var(--font-size-body-2)',
  display: 'grid',
  gridTemplateRows: 'auto auto',
  padding: '1.5rem 1rem',
  gap: '0.5rem',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--color-surface-2)',
  ':hover': {
    backgroundColor: 'var(--color-surface-interactive)',
  },
  ':hover span': {
    textDecoration: 'none',
  },
})

async function SiblingLink({
  source,
  direction,
}: {
  source: DocsSource
  direction: 'previous' | 'next'
}) {
  return (
    <StyledLink
      href={source.getPath()}
      css={{
        gridTemplateColumns:
          direction === 'previous' ? 'min-content auto' : 'auto min-content',
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <span
        css={{
          gridColumn: direction === 'previous' ? 2 : 1,
          gridRow: 1,
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {direction === 'previous' ? 'Previous' : 'Next'}
      </span>
      <div
        css={{
          gridColumn: '1 / -1',
          gridRow: 2,
          display: 'grid',
          gridTemplateColumns: 'subgrid',
          alignItems: 'center',
        }}
      >
        {direction === 'previous' ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            style={{
              width: 'var(--font-size-body-2)',
              height: 'var(--font-size-body-2)',
            }}
          >
            <path
              d="M14 6L8 12L14 18"
              stroke="var(--color-foreground-interactive)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
        <span>{source.getTitle()}</span>
        {direction === 'next' ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            style={{
              width: 'var(--font-size-body-2)',
              height: 'var(--font-size-body-2)',
            }}
          >
            <path
              d="M10 18L16 12L10 6"
              stroke="var(--color-foreground-interactive)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
    </StyledLink>
  )
}
