import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allData } from 'data'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

export function generateStaticParams() {
  return allData.paths().map((pathname) => ({ slug: pathname }))
}

async function getImageSource(path: string) {
  const data = await readFile(resolve(currentDirectory, path))
  return `data:image/png;base64,${data.toString('base64')}`
}

export async function GET(
  _: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const data = (await allData.get(params.slug))!
  const logoSource = await getImageSource('../../../public/logo.png')
  const chevronSource = await getImageSource('images/chevron.png')
  const backgroundSource = await getImageSource('images/background.png')
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
