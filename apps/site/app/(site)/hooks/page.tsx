import { isJavaScriptFile } from 'renoun'

import { HooksDirectory } from '@/collections'
import { Card } from '@/components/Card'
import { Row } from '@/components/Row'

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
          Leverage renoun’s React hooks to manage state and behavior in your
          documentation. These hooks simplify common patterns like active
          section tracking based on scroll and theme preference.
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
