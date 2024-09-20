import { TableOfContents } from '@/components/TableOfContents'
import Sponsors, { headings } from './sponsors.mdx'

export default function Page() {
  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '4rem',

        '@media screen and (min-width: 60rem)': {
          gridTemplateColumns: 'minmax(0, 1fr) 12rem',
        },
      }}
    >
      <main className="prose">
        <Sponsors />
      </main>
      <TableOfContents headings={headings} />
    </div>
  )
}
