import Link from 'next/link'
import { Text } from 'components'
import allDocs from 'mdxts/docs'

export function Sidebar() {
  return (
    <aside>
      <a href="/">
        <h1>MDXTS</h1>
      </a>
      {allDocs.map((doc) => {
        return (
          <Link key={doc.slug} href={doc.slug} className="link">
            <Text>{doc.name}</Text>
          </Link>
        )
      })}
    </aside>
  )
}
