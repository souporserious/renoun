'use client'
import * as React from 'react'

export function Editor({
  defaultValue,
}: {
  defaultValue: string
}): JSX.Element {
  const [value, setValue] = React.useState<string>(defaultValue)

  return (
    <textarea
      value={value}
      onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => {
        setValue(event.target.value)
      }}
    />
  )
}
