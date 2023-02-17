import { getComponent } from 'mdxts/utils'
import allDocs from 'mdxts/docs'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }))
}

export default async function Page({ params }: { params: { slug: string } }) {
  const doc = allDocs.find((doc) => doc.slug === params.slug)

  if (!doc) {
    console.log('No doc found for slug: ', params.slug)
    return null
  }

  const Component = await getComponent(doc.mdx.code)

  return <Component />
}
