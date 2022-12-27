import { Box } from 'components'
import styled from 'styled-components'

const StyledText = styled.span({ color: 'tomato' })

export default function BasicUsage() {
  return (
    <Box>
      Hello <StyledText>Box</StyledText>
    </Box>
  )
}
