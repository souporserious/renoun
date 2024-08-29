import { styled } from 'restyle'

import { Box } from '..'

const StyledText = styled('span', { color: 'tomato' })

/** A basic example of using the `Box` component */
export default function BasicUsage() {
  return (
    <Box>
      Hello <StyledText>Box</StyledText>
    </Box>
  )
}
