import { styled } from 'restyle'
import type { ExportSource } from 'mdxts/collections'
import Link from 'next/link'

import { ComponentsCollection } from '@/collections'

export default function Components() {
  const source = ComponentsCollection.getSource()!
  const sourceExports = source.getExports()

  return (
    <main css={{ display: 'grid', padding: '4rem 0', gap: '1rem' }}>
      <h1 css={{ margin: 0 }}>Components</h1>
      <ul
        css={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {sourceExports.map((source) => (
          <ComponentItem key={source.getPath()} source={source} />
        ))}
      </ul>
    </main>
  )
}

const StyledLink = styled(Link, { display: 'block', padding: '1rem' })

async function ComponentItem({
  source,
}: {
  source: ExportSource<React.ComponentType>
}) {
  return (
    <li>
      <StyledLink href={source.getPath()}>
        <h2 css={{ margin: 0 }}>{source.getName()}</h2>
      </StyledLink>
    </li>
  )
}
