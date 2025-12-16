'use client'
import { Card } from '@/components'

/** A card with a title, content and a subtle action link. */
export default function BasicUsage() {
  return (
    <Card variant="outlined">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h4 style={{ margin: 0 }}>Getting Started</h4>
        <p style={{ margin: 0, opacity: 0.9 }}>
          Build cards with headings, content and actions using your own layout.
        </p>
        <a href="#" style={{ color: '#60a5fa', textDecoration: 'none' }}>
          Learn more →
        </a>
      </div>
    </Card>
  )
}

