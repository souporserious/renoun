import { styled } from 'restyle'
import Link from 'next/link'

import { ComponentsCollection, type ComponentSource } from '@/collections'
import { Text } from '@/components/Text'

export default async function Components() {
  const sources = await ComponentsCollection.getSources({ depth: 1 })

  return (
    <>
      <Text variant="heading-1" css={{ marginBottom: '4rem' }}>
        Components
      </Text>
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
    </>
  )
}

const StyledLink = styled(Link, {
  display: 'block',
  padding: '1rem',
  margin: '0 -1rem',
})

async function ComponentItem({ source }: { source: ComponentSource }) {
  return (
    <li>
      <StyledLink href={source.getPath()}>
        <h2 css={{ margin: 0 }}>{source.getName()}</h2>
      </StyledLink>
    </li>
  )
}
