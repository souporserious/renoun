import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: ['docs', 'getting-started'] }]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
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
