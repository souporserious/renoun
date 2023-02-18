import allDocs from 'mdxts/docs'
import { MDXComponent } from 'app/MDXComponent'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }))
}

export default async function Page({ params }: { params: { slug: string } }) {
  const doc = allDocs.find((doc) => doc.slug === params.slug)

  if (!doc) {
    return null
  }

  return <MDXComponent code={doc.mdx.code} />
}
