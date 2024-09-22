import { styled } from 'restyle'
import Link from 'next/link'

import { ComponentsCollection, type ComponentSource } from '@/collections'

export default async function Components() {
  const sources = await ComponentsCollection.getSources({ depth: 1 })

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      <div className="prose">
        <h1>Components</h1>
        <p>
          Easily build interactive and engaging documentation with Renoun’s
          powerful set of React components. From API references to advanced
          syntax highlighting with embedded type information, each component is
          designed to streamline your content workflow. Explore the building
          blocks below to start creating rich, responsive, and an efficient
          developer experiences.
        </p>
      </div>
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
    </div>
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
