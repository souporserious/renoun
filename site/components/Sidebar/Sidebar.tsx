import Link from 'next/link'
import { Text } from 'components/Text'
import allDocs from 'mdxts/docs'
import allReact from 'mdxts/react'

export function Sidebar() {
  return (
    <aside>
      <a href="/">
        <h1>MDXTS</h1>
      </a>
      <h2>Docs</h2>
      {allDocs.map((doc) => {
        return (
          <Link key={doc.slug} href={doc.slug} className="link">
            <Text>{doc.name}</Text>
          </Link>
        )
      })}

      <h2>React</h2>
      {allReact.map((data) => {
        return (
          <Link key={data.slug} href={data.slug} className="link">
            <Text>{data.name}</Text>
          </Link>
        )
      })}
    </aside>
  )
}
