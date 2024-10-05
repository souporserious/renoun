import { APIReference } from 'renoun/components'

import { CollectionsCollection, CollectionsDocsCollection } from '@/collections'
import { TableOfContents } from '@/components/TableOfContents'

export default async function Page() {
  const source = CollectionsCollection.getSource()!
  const sourceExports = source.getExports()
  const docSource = CollectionsDocsCollection.getSource()!
  const Content = await docSource.getExport('default').getValue()
  const headings = await docSource.getExport('headings').getValue()

  return (
    <>
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.6rem',
        }}
      >
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.6rem',
          }}
          className="prose"
        >
          <h1 css={{ fontSize: '3rem', margin: 0 }}>Collections</h1>
          <Content />
        </div>
        {/* <div>
          <h2
            id="api-reference"
            css={{
              fontSize: 'var(--font-size-heading-2)',
              lineHeight: 'var(--line-height-heading-2)',
              fontWeight: 'var(--font-weight-heading)',
              marginBlockStart: '1.6rem',
            }}
          >
            API Reference
          </h2>
          {sourceExports.map((exportSource) => (
            <APIReference key={exportSource.getSlug()} source={exportSource} />
          ))}
        </div> */}
      </div>

      <aside
        css={{
          alignSelf: 'start',
          position: 'sticky',
          top: '1rem',
          '@media (max-width: 767px)': {
            display: 'none',
          },
        }}
      >
        <TableOfContents
          headings={[
            ...headings,
            {
              id: 'api-reference',
              text: 'API Reference',
              depth: 2,
            },
            ...sourceExports.map((source) => ({
              id: source.getSlug(),
              text: source.getName(),
              depth: 3,
            })),
          ]}
        />
      </aside>
    </>
  )
}
