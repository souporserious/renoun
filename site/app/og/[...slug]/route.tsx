import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allData } from 'data'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

async function getImageSource(path: string) {
  const data = await readFile(resolve(currentDirectory, path))
  return `data:image/png;base64,${data.toString('base64')}`
}

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
  const [data, logoSource, chevronSource, backgroundSource] = await Promise.all(
    [
      allData.get(slug),
      getImageSource('../../../public/logo.png'),
      getImageSource('images/chevron.png'),
      getImageSource('images/background.png'),
    ]
  )

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
