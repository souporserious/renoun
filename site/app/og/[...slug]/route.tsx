import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export function generateStaticParams() {
  return [{ slug: ['docs', 'getting-started'] }, { slug: ['docs', 'routing'] }]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const logoSource = await fetch(
    new URL('../../../public/logo.png', import.meta.url)
  ).then((response) => response.arrayBuffer())

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
        <img
          src={`data:image/png;base64,${Buffer.from(logoSource).toString('base64')}`}
          height="100"
        />
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
