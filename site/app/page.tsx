import Link from 'next/link'
import { Text } from 'components'
import allDocs from 'mdxts/docs'

export default function Index() {
  return allDocs.map((doc) => {
    return (
      <Link key={doc.slug} href={doc.slug}>
        <Text>{doc.slug}</Text>
      </Link>
    )
  })
}
