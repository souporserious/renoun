import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allData } from 'data'

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
        gap: 54,
        backgroundImage: `url(${backgroundSource})`,
      }}
    >
      <img src={logoSource} height="80" />
      {children}
    </div>
  )
}

export function generateStaticParams() {
  return allData
    .paths()
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
              color: '#79a6cf',
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
  const data = (await allData.get(slug))!
  const category = data.pathname.includes('packages') ? 'Packages' : 'Docs'

  return new ImageResponse(
    (
      <Container>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
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
              color: 'white',
            }}
          >
            {data.title}
          </span>
        </div>
      </Container>
    ),
    options
  )
}
