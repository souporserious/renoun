import { Box } from 'components'
import { styled } from 'restyle'

const StyledText = styled('span', { color: 'tomato' })

export default function BasicUsage() {
  return (
    <Box>
      Hello <StyledText>Box</StyledText>
    </Box>
  )
}
