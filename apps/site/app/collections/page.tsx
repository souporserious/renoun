import { APIReference } from 'omnidoc/components'

import { CollectionsCollection } from '@/collections'
import Guide, { headings } from './guide.mdx'

export default async function Page() {
  const source = CollectionsCollection.getSource()!
  const sourceExports = source.getExports()

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '4rem 0',
        gap: '4rem',
      }}
    >
      <h1 css={{ fontSize: '3rem', margin: 0 }}>Collections</h1>
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
        <div>
          <Guide />
          <div css={{ height: '6rem' }} />
          <h2 id="api-reference" css={{ margin: '0 0 2rem' }}>
            API Reference
          </h2>
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
          <nav
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h3 css={{ margin: 0 }}>On this page</h3>
            <ul
              css={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}
            >
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a
                    href={`#${heading.id}`}
                    css={{
                      display: 'block',
                      padding: '0.25rem 0',
                      paddingLeft: `${heading.depth - 2}rem`,
                    }}
                  >
                    {heading.text}
                  </a>
                </li>
              ))}
              {sourceExports ? (
                <li>
                  <a
                    href="#api-reference"
                    css={{
                      display: 'block',
                      padding: '0.25rem 0',
                    }}
                  >
                    API Reference
                  </a>
                  {sourceExports.map((source) => (
                    <ul
                      key={source.getPath()}
                      css={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                      }}
                    >
                      <li>
                        <a
                          href={`#${source.getSlug()}`}
                          css={{
                            display: 'block',
                            padding: '0.25rem 0',
                            paddingLeft: '1rem',
                          }}
                        >
                          {source.getName()}
                        </a>
                      </li>
                    </ul>
                  ))}
                </li>
              ) : null}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  )
}
