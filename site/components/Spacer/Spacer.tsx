import styled from 'styled-components'

interface Props {
  size?: string
}

export const Spacer = styled.div<Props>(({ size }) => ({
  gridColumn: '1 / -1',
  minHeight: size,
}))
