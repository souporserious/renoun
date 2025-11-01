/** Derive the examples list from the GitHub repository at runtime. */
export async function getExampleOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  const response = await fetch(
    'https://api.github.com/repos/souporserious/renoun/contents/examples?ref=main'
  )

  if (!response.ok) {
    throw new Error(
      `Failed to list examples: ${response.status} ${response.statusText}`
    )
  }

  const items = (await response.json()) as Array<{
    name: string
    type: string
  }>
  const slugs = items
    .filter((item) => item.type === 'dir')
    .map((item) => item.name)
  const toTitle = (slug: string) =>
    slug
      .split('-')
      .map((string) =>
        string ? string[0].toUpperCase() + string.slice(1) : string
      )
      .join(' ')

  return slugs.map((slug) => ({
    value: slug,
    label: toTitle(slug),
  }))
}
