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
  const singlePackage = await allPackages.get(params.example.slice(0, -1))
  const example = await allPackages.getExample(params.example)

  if (singlePackage === undefined || example === undefined) {
    return notFound()
  }

  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100dvh',
        padding: '2rem',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <a
        href={singlePackage.pathname}
        style={{
          fontSize: 'var(--font-size-body-3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          position: 'absolute',
          top: '1rem',
          left: '1rem',
        }}
      >
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          width="1rem"
          height="1rem"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <span>
          Back to <strong>{singlePackage.label}</strong>
        </span>
      </a>
      <a
        href={example.sourcePath}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: 'var(--font-size-body-3)',
          position: 'absolute',
          top: '1rem',
          right: '1rem',
        }}
      >
        View Source
      </a>
      <example.moduleExport />
    </div>
  )
}
