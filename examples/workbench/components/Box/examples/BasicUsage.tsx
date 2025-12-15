import { styled } from 'restyle'
import { Box } from '@/components'

const Title = styled('div', {
  fontWeight: 600,
  marginBottom: 6,
})

const Description = styled('p', {
  margin: 0,
  opacity: 0.9,
})

/** A practical card-like container using padding and borders. */
export default function BasicUsage() {
  return (
    <Box
      padding={16}
      style={{
        borderRadius: 8,
        border: '1px solid rgba(148, 163, 184, 0.25)',
        backgroundColor: 'rgba(148, 163, 184, 0.06)',
      }}
    >
      <Title>Box container</Title>
      <Description>
        Use <code>Box</code> to create simple layout surfaces with padding.
      </Description>
    </Box>
  )
}

