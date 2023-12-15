import { Stack } from 'components/Stack'
import { Spinner, spinnerSizes } from 'components/Spinner'

export default function BasicUsage() {
  const spinnerSizeKeys = Object.keys(
    spinnerSizes
  ) as (keyof typeof spinnerSizes)[]
  return (
    <Stack flexDirection="row" padding="8px" gap="8px">
      {spinnerSizeKeys.map((size) => (
        <Spinner
          key={size}
          size={size}
          primaryColor="rgba(255,255,255,0.75)"
          secondaryColor="rgba(255,255,255,0.5)"
        />
      ))}
    </Stack>
  )
}
