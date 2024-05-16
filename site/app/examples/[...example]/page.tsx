import { notFound } from 'next/navigation'
import { getThemeColors } from 'mdxts'
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

  if (!example) {
    throw new Error(`Example not found for "${params.example.join('/')}"`)
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

  if (!singlePackage || !example) {
    return notFound()
  }

  const theme = await getThemeColors()

  return (
    <div
      style={{
        display: 'grid',
        minHeight: '100dvh',
        padding: '3rem 2rem',
        position: 'relative',
        backgroundColor: 'var(--color-background)',
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
          left: '2rem',
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
      <div
        style={{
          position: 'absolute',
          top: '0.8rem',
          right: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <h1 style={{ fontSize: 'var(--font-size-body-3)' }}>{example.name}</h1>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <a
            title={
              example.previous
                ? `Previous Example: ${example.previous.label}`
                : undefined
            }
            href={
              example.previous
                ? `/examples${example.previous.pathname}`
                : undefined
            }
            style={{
              display: 'flex',
              opacity: example.previous ? 1 : 0.5,
              pointerEvents: example.previous ? undefined : 'none',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              style={{ width: '1rem', height: '1rem' }}
            >
              <path
                d="M14 6L8 12L14 18"
                stroke="var(--color-foreground-interactive)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <a
            title={
              example.next ? `Next Example: ${example.next.label}` : undefined
            }
            href={
              example.next ? `/examples${example.next.pathname}` : undefined
            }
            style={{
              display: 'flex',
              opacity: example.next ? 1 : 0.5,
              pointerEvents: example.next ? undefined : 'none',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              style={{ width: '1rem', height: '1rem' }}
            >
              <path
                d="M10 18L16 12L10 6"
                stroke="var(--color-foreground-interactive)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </nav>
      </div>
      <ViewSource
        href={example.sourcePath}
        style={{ position: 'absolute', bottom: '1rem', right: '2rem' }}
      />
      <div
        className={styles.container}
        style={{
          '--color-border': theme.panel.border,
          '--color-dot': `${theme.panel.border}8a`,
        }}
      >
        <CodeBlock
          fixImports
          showLineNumbers
          value={example.sourceText}
          language="tsx"
          className={{
            container: styles.codeBlock,
          }}
          style={{
            container: {
              fontSize: 'var(--font-size-code)',
              lineHeight: 'var(--line-height-code)',
              boxShadow: undefined,
              borderRadius: undefined,
            },
          }}
        />
        <div className={styles.preview}>
          <example.moduleExport />
        </div>
      </div>
    </div>
  )
}
