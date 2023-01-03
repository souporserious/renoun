import * as React from 'react'
import { DataProviderContext } from './DataProvider'

export function SourceLink({
  children = 'View Source',
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  const { dataItem } = React.useContext(DataProviderContext)

  if (!dataItem) {
    return null
  }

  return (
    <a
      href={dataItem.path}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  )
}
