import * as React from 'react'

export const DataProviderContext = React.createContext({
  data: null,
  allData: null,
  activeSlug: '',
}) as React.Context<{
  data: any
  allData: any
  activeSlug: string
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
