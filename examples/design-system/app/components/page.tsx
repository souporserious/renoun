import { styled } from 'restyle'
import Link from 'next/link'

import { ComponentsCollection, type ComponentSource } from '@/collections'

export default async function Components() {
  const sources = await ComponentsCollection.getSources({ depth: 1 })

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
        {sources.map((source) => (
          <ComponentItem key={source.getPath()} source={source} />
        ))}
      </ul>
    </main>
  )
}

const StyledLink = styled(Link, { display: 'block', padding: '1rem' })

async function ComponentItem({ source }: { source: ComponentSource }) {
  return (
    <li>
      <StyledLink href={source.getPath()}>
        <h2 css={{ margin: 0 }}>{source.getName()}</h2>
      </StyledLink>
    </li>
  )
}
