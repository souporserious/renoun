import { styled } from 'restyle'

interface Props {
  size?: string
}

export const Spacer = styled(
  (props) => <div aria-hidden {...props} />,
  (props: Props) => ({
    gridColumn: '1 / -1',
    minHeight: props.size,
  })
)
