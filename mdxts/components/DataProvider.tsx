// @ts-expect-error
import React, { createServerContext } from 'react'

export const DataProviderContext = createServerContext({
  data: null,
  allData: null,
  activeSlug: null,
}) as React.Context<{
  data: any
  allData: any
  activeSlug: string | null
}>

export function DataProvider({
  children,
  allData,
  activeSlug,
}: {
  children: any
  allData: any
  activeSlug: string
}) {
  const data = allData.find((data) => data.slug === activeSlug)

  return (
    <DataProviderContext.Provider value={{ data, allData, activeSlug }}>
      {children}
    </DataProviderContext.Provider>
  )
}
