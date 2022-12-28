import allDocs from 'mdxts/docs'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({
    slug: doc.slug,
  }))
}

export default function Page({ params }: { params: { slug: string } }) {
  const doc = allDocs.find((doc) => doc.slug === params.slug)

  return <h1>My Page {doc.path}</h1>
}
