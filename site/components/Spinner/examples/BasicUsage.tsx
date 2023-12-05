import { Stack } from 'components/Stack'
import { Spinner, spinnerSizes } from 'components/Spinner'

export default function BasicUsage() {
  return (
    <Stack flexDirection="row" padding="8px" gap="8px">
      {Object.keys(spinnerSizes).map((size: keyof typeof spinnerSizes) => (
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
