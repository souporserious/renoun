import * as React from 'react'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const contentType = 'image/png'

export default async function Image() {
  const logoSource = await fetch(
    new URL('../public/logo.png', import.meta.url)
  ).then((response) => response.arrayBuffer())

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 48,
          background: 'black',
          color: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          // @ts-expect-error
          src={logoSource}
          style={{ height: 120 }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 60,
              fontFamily: 'Geist-Regular',
              // @ts-expect-error
              textWrap: 'balance',
              color: '#78a6ce',
            }}
          >
            Exceptional Content & Docs
          </h1>
          <span
            style={{
              fontSize: 24,
              padding: '12px 24px',
              border: '1px solid #6a94ba',
              borderRadius: 32,
              fontFamily: 'Geist-Regular',
            }}
          >
            Preview
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Geist-Regular',
          data: await fetch(
            new URL(
              '../node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf',
              import.meta.url
            )
          ).then((response) => response.arrayBuffer()),
        },
        {
          name: 'Geist-SemiBold',
          data: await fetch(
            new URL(
              '../node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf',
              import.meta.url
            )
          ).then((response) => response.arrayBuffer()),
        },
      ],
    }
  )
}
