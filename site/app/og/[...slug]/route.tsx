import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allData, allPosts } from 'data'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

function getImageSource(path: string) {
  const data = readFileSync(resolve(currentDirectory, path))
  return `data:image/png;base64,${data.toString('base64')}`
}

const GeistRegular = readFileSync(
  resolve(currentDirectory, 'fonts/Geist-Regular.ttf')
)
const GeistSemibold = readFileSync(
  resolve(currentDirectory, 'fonts/Geist-SemiBold.ttf')
)
const logoSource = getImageSource('../../../public/logo.png')
const chevronSource = getImageSource('images/chevron.png')
const backgroundSource = getImageSource('images/background.png')
const options = {
  width: 1200,
  height: 630,
  fonts: [
    { name: 'GeistRegular', data: GeistRegular },
    { name: 'GeistSemiBold', data: GeistSemibold },
  ],
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        paddingTop: 200,
        gap: 60,
        backgroundImage: `url(${backgroundSource})`,
      }}
    >
      <img src={logoSource} height="80" />
      {children}
    </div>
  )
}

export function generateStaticParams() {
  const allPostSlugs = (allPosts.paths() as string[]).map((pathname) => [
    pathname,
  ])
  return allData
    .paths()
    .concat(allPostSlugs)
    .map((pathname) => ({
      slug: [...pathname.slice(0, -1), `${pathname.slice(-1).at(0)!}.png`],
    }))
    .concat({ slug: ['default.png'] })
}

export async function GET(
  _: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const baseSlug = params.slug.slice(-1).at(0)!.replace('.png', '')

  if (baseSlug === 'default') {
    return new ImageResponse(
      (
        <Container>
          <span
            style={{
              fontSize: 60,
              fontFamily: 'GeistSemiBold',
              textAlign: 'center',
              color: '#B3C9DD',
              maxWidth: 800,
            }}
          >
            The Content & Documentation SDK
          </span>
        </Container>
      ),
      options
    )
  }

  const slug = [...params.slug.slice(0, -1), baseSlug]
  let data = (await allData.get(slug))!
  let isPost = false

  if (!data) {
    data = (await allPosts.get(slug))!
    isPost = true
  }

  const category = isPost
    ? 'Blog'
    : data.pathname.includes('packages')
      ? 'Packages'
      : 'Docs'

  return new ImageResponse(
    (
      <Container>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 16px 12px',
            borderRadius: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          <span
            style={{
              fontSize: 60,
              fontFamily: 'GeistRegular',
              color: '#78A6CE',
            }}
          >
            {category}
          </span>
          <img src={chevronSource} height="64" style={{ top: 6 }} />
          <span
            style={{
              fontSize: 60,
              fontFamily: 'GeistSemiBold',
              color: '#B3C9DD',
            }}
          >
            {data.frontMatter.title || data.title}
          </span>
        </div>
      </Container>
    ),
    options
  )
}
