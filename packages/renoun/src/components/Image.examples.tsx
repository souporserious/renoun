import React from 'react'
import { Image } from 'renoun'

const figmaSource = 'figma:KnjWnaZyFizO2HgD5tWYqh/mark'
const fallbackSource =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="16" fill="#111827"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#e5e7eb" font-family="Inter, system-ui, sans-serif" font-size="18">renoun</text></svg>`
  )

export function ComponentName() {
  const source = process.env['FIGMA_TOKEN'] ? figmaSource : fallbackSource

  return (
    <Image
      source={source}
      description="renoun logo mark"
      width={128}
      height={128}
    />
  )
}
