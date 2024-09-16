import React from 'react'

/** Displays a copyright notice. */
export function Copyright({
  startYear,
  showLabel = true,
}: {
  startYear?: number
  showLabel?: boolean
}) {
  const currentYear = new Date().getFullYear()
  const year = startYear ? `${startYear}-${currentYear}` : currentYear

  if (showLabel) {
    return <>Copyright &copy; {year}</>
  }

  return <>&copy; {year}</>
}
