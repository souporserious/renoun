import { Text } from 'components'
import allDocs from 'mdxts/docs'

export default function Index() {
  return allDocs.map((doc) => {
    return <Text key={doc.slug}>{doc.slug}</Text>
  })
}
