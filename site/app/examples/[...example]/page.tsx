import { notFound } from 'next/navigation'
import { allPackages } from 'data'
import { getSiteMetadata } from 'utils/get-site-metadata'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return (await allPackages.examplePaths()).map((pathname) => ({
    example: pathname,
  }))
}

export async function generateMetadata({
  params,
}: {
  params: { example: string[] }
}) {
  const example = await allPackages.getExample(params.example)

  if (example === undefined) {
    return notFound()
  }

  return getSiteMetadata({
    title: `${example.name} Example - MDXTS`,
  })
}

export default async function Page({
  params,
}: {
  params: { example: string[] }
}) {
  const example = await allPackages.getExample(params.example)

  if (example === undefined) {
    return notFound()
  }

  const Component = example.moduleExport

  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100dvh',
        overflow: 'auto',
      }}
    >
      <Component />
    </div>
  )
}
