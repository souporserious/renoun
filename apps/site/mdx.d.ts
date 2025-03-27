declare module '*.mdx' {
  export const headings: {
    id: any
    level: number
    children: React.ReactNode
    text: string
  }[]
}
