import { Box } from 'components'
import { useHover } from 'hooks'

export default function Hover() {
  const [hover, hoverProps] = useHover()
  return (
    <Box {...hoverProps} color={hover ? 'tomato' : 'papayawhip'}>
      Hover Me
    </Box>
  )
}
