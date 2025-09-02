import { HooksDirectory } from '@/collections'
import { Card } from '@/components/Card'
import { Row } from '@/components/Row'
import { isJavaScriptFile } from 'renoun'

export default async function Hooks() {
  const entries = await HooksDirectory.getEntries()

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3rem',
      }}
    >
      <div className="prose">
        <h1>Hooks</h1>
        <p>
          Leverage renoun’s collection of React hooks to manage state and
          behavior in your documentation experiences.
        </p>
        <p>
          These utilities simplify common patterns like section tracking and
          theme preference, helping you build interactive docs with ease.
        </p>
      </div>
      <Row>
        {entries.map(async (entry) => {
          const pathname = entry.getPathname()
          let baseName
          if (isJavaScriptFile(entry)) {
            const firstExport = await entry
              .getExports()
              .then((fileExports) => fileExports[0])
            baseName = firstExport.getName()
          } else {
            baseName = entry.getBaseName()
          }
          return <Card key={pathname} href={pathname} label={baseName} />
        })}
      </Row>
    </div>
  )
}
