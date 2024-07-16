import { notFound } from 'next/navigation'
import { MDXComponents } from 'mdxts/components'
import { MDXContent } from 'mdxts/components'
import { PageContainer } from 'components/PageContainer'
import { allData, allPackages } from 'data'
import { getSiteMetadata } from 'utils/get-site-metadata'
import { BASE_URL } from 'utils/constants'

// import { APIReference } from 'components/APIReference'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allPackages.paths().map((pathname) => ({ slug: pathname.slice(1) }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string[] }
}) {
  const data = await allPackages.get(['packages', ...params.slug])
  return getSiteMetadata({
    title: `${data?.title} - MDXTS`,
    description: data?.description,
    openGraph: {
      images: [
        {
          url: `${BASE_URL}/og/${['packages', ...params.slug].join('/')}.png`,
          width: 1200,
          height: 630,
          type: 'image/png',
        },
      ],
    },
  })
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const singlePackage = await allData.get(['packages', ...params.slug])

  if (!singlePackage) {
    return notFound()
  }

  const {
    Content,
    title,
    description,
    examples,
    exportedTypes,
    executionEnvironment,
  } = singlePackage

  return (
    <PageContainer dataSource={singlePackage}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        {title ? <h1 style={{ margin: 0 }}>{title}</h1> : null}
        {executionEnvironment === 'server' ? (
          <span
            style={{
              fontSize: 'var(--font-size-body-2)',
              padding: '0.25rem 0.8rem',
              border: '1px solid #3F687E',
              borderRadius: '1rem',
              flexShrink: 0,
            }}
          >
            Server Only
          </span>
        ) : null}
      </div>

      {description ? (
        <MDXContent
          value={description}
          components={{
            code: (props) => <MDXComponents.code {...props} paddingY="0" />,
          }}
        />
      ) : null}

      {Content ? <Content renderTitle={false} /> : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2.8rem',
        }}
      >
        {examples.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.6rem',
            }}
          >
            <h2 id="examples">Examples</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
                gap: '1rem',
              }}
            >
              {examples.map((example) => (
                <div
                  key={example.slug}
                  id={example.slug}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    padding: '0.5rem',
                    gap: '0.5rem',
                    border: '1px solid var(--color-separator)',
                    borderRadius: '0.25rem',
                    backgroundColor: 'var(--color-surface-2)',
                  }}
                >
                  <div
                    style={{
                      height: '10rem',
                      padding: '1rem',
                      overflow: 'hidden',
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-separator-secondary)',
                    }}
                  >
                    <div
                      style={{
                        '--scale': 0.4,
                        display: 'flex',
                        transformOrigin: 'top left',
                        scale: 'var(--scale)',
                        width: 'calc(100% / var(--scale))',
                        height: 'calc(100% / var(--scale))',
                      }}
                    >
                      <div style={{ margin: 'auto' }}>
                        <example.moduleExport />
                      </div>
                    </div>
                  </div>
                  <h3
                    style={{
                      fontSize: 'var(--font-size-body-2)',
                      color: 'var(--color-foreground-interactive)',
                      flexShrink: 0,
                      margin: 0,
                    }}
                  >
                    {example.name}
                  </h3>
                  <a
                    href={`/examples${example.pathname}`}
                    style={{
                      position: 'absolute',
                      inset: 0,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {exportedTypes.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h2 id="api-reference">API Reference</h2>
            {/* {exportedTypes.map((type, index) => {
              const isActive = singlePackage.pathname === type.pathname
              return (
                <APIReference key={index} type={type} isActive={isActive} />
              )
            })} */}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
