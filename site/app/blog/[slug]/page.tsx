import { notFound } from 'next/navigation'
import { PageContainer } from 'components/PageContainer'
import { allPosts } from 'data'
import { getSiteMetadata } from 'utils/get-site-metadata'
import { BASE_URL } from 'utils/constants'
import logoSrc from './logo.jpeg'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allPosts.paths().map((pathname) => ({ slug: pathname }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}) {
  const data = await allPosts.get(params.slug)
  return getSiteMetadata({
    title: `${data?.title} - MDXTS`,
    description: data?.description,
    openGraph: {
      images: [
        {
          url: `${BASE_URL}/og/${params.slug}.png`,
          width: 1200,
          height: 630,
          type: 'image/png',
        },
      ],
    },
  })
}

export default async function Page({ params }: { params: { slug: string } }) {
  const post = await allPosts.get(params.slug)

  if (!post) {
    return notFound()
  }

  const { Content, frontMatter } = post

  return (
    <PageContainer dataSource={post} viewSource={false}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h1>{frontMatter.title}</h1>
        {post.updatedAt ? (
          <time
            dateTime={post.updatedAt}
            itemProp="dateModified"
            style={{
              textDecoration: 'none',
              fontSize: 'var(--font-size-body-3)',
              fontWeight: 600,
              color: 'var(--color-foreground-secondary)',
            }}
          >
            {new Date(post.updatedAt).toLocaleString('en', {
              year: '2-digit',
              month: '2-digit',
              day: '2-digit',
            })}
          </time>
        ) : null}
      </div>
      {Content ? <Content renderTitle={false} /> : null}
      <div
        style={{
          width: '100%',
          height: 1,
          marginTop: '4rem',
          backgroundColor: 'var(--color-separator-secondary)',
        }}
      />
      <div style={{ display: 'flex', gap: '1rem' }}>
        <img
          alt="souporserious logo"
          src={logoSrc.src}
          width={60}
          height={60}
          style={{ borderRadius: '100%' }}
        />
        <div>
          <p>{frontMatter.author}</p>
          <a
            href="https://twitter.com/souporserious"
            rel="noopener noreferrer"
            target="_blank"
          >
            @souporserious
          </a>
        </div>
      </div>
    </PageContainer>
  )
}
