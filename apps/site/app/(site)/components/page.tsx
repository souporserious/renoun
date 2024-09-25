import { ComponentsCollection } from '@/collections'
import { Card } from '@/components/Card'
import { Row } from '@/components/Row'

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
      <Row>
        {sources.map((source) => (
          <Card
            key={source.getPath()}
            href={source.getPath()}
            label={source.getName()}
          />
        ))}
      </Row>
    </div>
  )
}
