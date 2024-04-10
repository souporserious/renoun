import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'

export function generateStaticParams() {
  return [{ slug: ['docs', 'getting-started'] }, { slug: ['docs', 'routing'] }]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const logoData = await readFile('public/logo.png')
  const logoSource = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'black',
          width: '100%',
          height: '100%',
          gap: '1rem',
        }}
      >
        <img src={logoSource} height="100" />
        <span
          style={{
            fontSize: '4rem',
            color: 'white',
          }}
        >
          {params.slug.join('/')}
        </span>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
