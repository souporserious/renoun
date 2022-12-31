import * as React from 'react'

export const DataProviderContext = React.createContext({
  data: null,
  dataItem: null,
  slug: '',
}) as React.Context<{
  data: any
  dataItem: any
  slug: string
}>

export function DataProvider({
  children,
  data,
  slug,
}: {
  children: any
  data: any
  slug: string
}) {
  const dataItem = data.find((dataItem) => dataItem.slug === slug)

  return (
    <DataProviderContext.Provider value={{ data, dataItem, slug }}>
      {children}
    </DataProviderContext.Provider>
  )
}
