import { APIReference } from 'renoun/components'

import { CollectionsCollection } from '@/collections'
import { TableOfContents } from '@/components/TableOfContents'
import Intro from './intro.mdx'

export default async function Page() {
  const source = CollectionsCollection.getSource()!
  const sourceExports = source.getExports()

  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '4rem',

        '@media (min-width: 60rem)': {
          gridTemplateColumns: 'minmax(0, 1fr) 12rem',
        },
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
        <Intro />
        <h2 id="api-reference">API Reference</h2>
        {sourceExports.map((exportSource) => (
          <APIReference key={exportSource.getSlug()} source={exportSource} />
        ))}
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
    </div>
  )
}
