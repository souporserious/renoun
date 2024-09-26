import { TableOfContents } from '@/components/TableOfContents'
import Sponsors, { headings } from './sponsors.mdx'

export default function Page() {
  return (
    <>
      <main className="prose">
        <Sponsors />
      </main>
      <TableOfContents headings={headings} />
    </>
  )
}
