import type { Metadata } from 'next'

export const metadata = {
  title: '@renoun/screenshot - Pixel-Perfect CSS Screenshots',
  description: `The screenshot library that actually works. Capture any element with pixel-perfect accuracy including transforms, gradients, clipping, filters, and everything in between.`,
} satisfies Metadata

export default function ScreenshotLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
