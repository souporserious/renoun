import allDocs from 'mdxts/docs'
import { flattenData } from 'mdxts/utils'
import { MDXComponent } from 'app/MDXComponent'

const flattenedDocs = flattenData(allDocs[0].children)

export async function generateStaticParams() {
  return flattenedDocs.map((doc) => ({ slug: doc.pathSegments }))
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const doc = flattenedDocs.find(
    (doc) => doc.pathSegments.join('') === params.slug.join('')
  )

  if (doc?.code) {
    return <MDXComponent code={doc.code} />
  }

  return null
}
