export interface GitStatusPorcelainEntry {
  status: string
  paths: string[]
}

function splitNullDelimitedRecords(output: string): string[] {
  if (output.length === 0) {
    return []
  }

  const records = output.split('\0')
  if (records.length > 0 && records[records.length - 1] === '') {
    records.pop()
  }

  return records.filter((record) => record.length > 0)
}

export function parseNullTerminatedGitPathList(output: string): string[] {
  return splitNullDelimitedRecords(output)
}

export function parseGitStatusPorcelainV1Z(
  output: string
): GitStatusPorcelainEntry[] {
  const records = splitNullDelimitedRecords(output)
  const entries: GitStatusPorcelainEntry[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record || record.length < 4 || record.charCodeAt(2) !== 32) {
      continue
    }

    const status = record.slice(0, 2)
    const firstPath = record.slice(3)
    if (!firstPath) {
      continue
    }

    const isRenameOrCopy = status.includes('R') || status.includes('C')
    if (isRenameOrCopy) {
      const secondPath = records[index + 1]
      if (typeof secondPath === 'string' && secondPath.length > 0) {
        entries.push({
          status,
          paths: [firstPath, secondPath],
        })
        index += 1
        continue
      }
    }

    entries.push({
      status,
      paths: [firstPath],
    })
  }

  return entries
}
