/** Flattens a tree of data into a single array. */
export function flattenData(data) {
  if (Array.isArray(data)) {
    return data.flatMap(flattenData)
  }

  if (data.children) {
    return data.children.flatMap(flattenData)
  }

  return data
}
