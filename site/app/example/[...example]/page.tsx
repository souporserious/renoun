import { notFound } from 'next/navigation'
import { allPackages } from 'data'
import { getSiteMetadata } from 'utils/get-site-metadata'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  const allPaths = allPackages.paths()
  const allPackageData = await allPackages.all()
  const allExamples = await Promise.all(
    Object.values(allPackageData).map((data) => data.examples)
  )

  return allExamples.flatMap((examples, index) =>
    examples.map((example) => [...allPaths[index], example.name.toLowerCase()])
  )
}

export async function generateMetadata({
  params,
}: {
  params: { example: string[] }
}) {
  const packageSlug = params.example.slice(0, 2)
  const exampleSlug = params.example.slice(2).at(0)!
  const component = await allPackages.get(packageSlug)

  if (component === null) {
    return notFound()
  }

  const examples = await component.examples
  const example = examples?.find(
    (example) => example.name.toLowerCase() === exampleSlug
  )

  if (example === undefined) {
    return
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
  const packageSlug = params.example.slice(0, 2)
  const exampleSlug = params.example.slice(2).at(0)!
  const component = await allPackages.get(packageSlug)

  if (component === null) {
    return notFound()
  }

  const examples = await component.examples
  const example = examples?.find(
    (example) => example.name.toLowerCase() === exampleSlug
  )

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
