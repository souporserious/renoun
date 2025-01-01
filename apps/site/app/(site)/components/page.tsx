import { ComponentsCollection } from '@/collections'
import { Card } from '@/components/Card'
import { Row } from '@/components/Row'

export default async function Components() {
  const entries = await ComponentsCollection.getEntries()

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3rem',
      }}
    >
      <div className="prose">
        <h1>Components</h1>
        <p>
          Easily build interactive and engaging documentation with renoun’s
          powerful set of React components.
        </p>
        <p>
          From API references to advanced syntax highlighting with embedded type
          information, each component is designed to streamline your content
          workflow. Explore the building blocks below to start creating rich,
          responsive, and an efficient developer experiences.
        </p>
      </div>
      <Row>
        {entries.map((entry) => (
          <Card
            key={entry.getPath()}
            href={entry.getPath()}
            label={entry.getBaseName()}
          />
        ))}
      </Row>
    </div>
  )
}
