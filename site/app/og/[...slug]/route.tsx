import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allData } from 'data'

function getImageSource(path: string) {
  const currentDirectory = dirname(fileURLToPath(import.meta.url))
  const data = readFileSync(resolve(currentDirectory, path))
  return `data:image/png;base64,${data.toString('base64')}`
}

const logoSource = getImageSource('../../../public/logo.png')
const chevronSource = getImageSource('images/chevron.png')
const backgroundSource = getImageSource('images/background.png')

export function generateStaticParams() {
  return allData.paths().map((pathname) => ({
    slug: [...pathname.slice(0, -1), `${pathname.slice(-1).at(0)!}.png`],
  }))
}

export async function GET(
  _: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slug = [
    ...params.slug.slice(0, -1),
    params.slug.slice(-1).at(0)!.replace('.png', ''),
  ]
  const data = await allData.get(slug)

  if (!data) {
    return new Response('Not found', { status: 404 })
  }

  const category = data.pathname.includes('packages') ? 'Packages' : 'Docs'

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          gap: 54,
          backgroundImage: `url(${backgroundSource})`,
        }}
      >
        <img src={logoSource} height="80" />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span style={{ fontSize: 60, color: '#78A6CE' }}>{category}</span>
          <img src={chevronSource} height="64" style={{ top: 6 }} />
          <span style={{ fontSize: 60, color: 'white' }}>{data.title}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
