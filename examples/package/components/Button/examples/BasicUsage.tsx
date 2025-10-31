'use client'
import { Box, Button } from '@/components'
import { useCounter } from '@/hooks'

/** Primary/secondary buttons with a practical click counter. */
export default function BasicUsage() {
  const { count, increment, decrement } = useCounter(0)

  return (
    <Box
      padding={16}
      backgroundColor="rgba(148, 163, 184, 0.06)"
      style={{ borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.25)' }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="primary" onClick={increment}>
          Increment
        </Button>
        <Button variant="secondary" onClick={decrement}>
          Decrement
        </Button>
        <span style={{ fontWeight: 600 }}>Count: {count}</span>
      </div>
    </Box>
  )
}
