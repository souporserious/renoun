import type { FileSystemEntry } from 'renoun/file-system'
import { styled } from 'restyle'
import Link from 'next/link'

import { ComponentsCollection } from '@/collections'

export default async function Components() {
  const entries = await ComponentsCollection.getEntries()

  return (
    <main
      css={{
        display: 'grid',
        padding: '4rem 0',
        gap: '1rem',
      }}
    >
      <h1 css={{ margin: 0 }}>Components</h1>
      <ul
        css={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {entries.map((entry) => (
          <ComponentEntry key={entry.getPath()} entry={entry} />
        ))}
      </ul>
    </main>
  )
}

const StyledLink = styled(Link, { display: 'block', padding: '1rem' })

async function ComponentEntry({ entry }: { entry: FileSystemEntry<any> }) {
  return (
    <li>
      <StyledLink href={entry.getPath()}>
        <h2 css={{ margin: 0 }}>{entry.getBaseName()}</h2>
      </StyledLink>
    </li>
  )
}
