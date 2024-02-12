import { notFound } from 'next/navigation'
import { CodeBlock } from 'mdxts/components'
import { allPackages } from 'data'
import { ViewSource } from 'components/ViewSource'
import { getSiteMetadata } from 'utils/get-site-metadata'
import styles from './page.module.css'

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
        height: '100dvh',
        padding: '3rem 2rem',
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
          top: '0.8rem',
          left: '0.6rem',
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
      <ViewSource
        href={example.sourcePath}
        style={{ position: 'absolute', top: '0.8rem', right: '0.6rem' }}
      />
      <div className={styles.container}>
        <CodeBlock
          allowErrors
          lineNumbers
          value={example.sourceText}
          language="tsx"
          style={{ margin: 0 }}
        />
        <div className={styles.preview}>
          <example.moduleExport />
        </div>
      </div>
    </div>
  )
}
