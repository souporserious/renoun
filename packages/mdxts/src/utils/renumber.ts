import fs from 'node:fs/promises'
import path from 'path'
import chokidar from 'chokidar'

/** Sorts files and folders by their number prefix, if present. */
function sortFilesAndFolders(a: string, b: string) {
  const matchA = a.match(/\d+/)
  const matchB = b.match(/\d+/)

  // If one or both filenames don't contain a number, fallback to a lexicographic sort
  if (!matchA && !matchB) {
    return a.localeCompare(b)
  }
  if (!matchA) {
    return 1
  }
  if (!matchB) {
    return -1
  }

  const numberA = parseInt(matchA[0], 10)
  const numberB = parseInt(matchB[0], 10)

  return numberA - numberB
}

/** Returns the first number in a string, or null if there is none. */
function getFirstNumberInString(string: string) {
  const match = string.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

/** Recursively renumbers files and folders in a directory. */
async function processDirectory(
  directory: string,
  forcedRename: { oldName: string; newName: string } | null = null
) {
  let items: string[]

  try {
    items = await fs.readdir(directory)
  } catch (error) {
    console.error(
      `mdxts(renumber): Could not read directory ${directory}: ${error}`
    )
    return
  }

  // If there's a forced rename, move it to its proper place
  if (forcedRename) {
    const index = items.indexOf(forcedRename.newName)
    if (index !== -1) {
      items.splice(index, 1, forcedRename.oldName)
    }
  }

  items.sort(sortFilesAndFolders)

  // Determine the required padding length based on the maximum index
  const maxIndex = items.length
  const paddingLength = Math.max(2, maxIndex.toString().length)

  for (let index = 0; index < items.length; index++) {
    const oldName = items[index]
    const oldPath = path.join(directory, oldName)
    const stat = await fs.stat(oldPath)
    const newNumber = (index + 1).toString().padStart(paddingLength, '0')
    const newName = oldName.replace(/^\d+/, newNumber)
    const newPath = path.join(directory, newName)

    if (oldPath === newPath) {
      continue
    }

    try {
      await fs.rename(oldPath, newPath)
      console.log(`mdxts:
renumbered: "${oldPath}"
to: "${newPath}"
`)
    } catch (error) {
      // If the rename failed, it's probably because the file already exists
    }

    if (stat.isDirectory()) {
      await processDirectory(newPath)
    }
  }
}

export async function renumberFilenames() {
  const absoluteDirectory = process.cwd()

  await processDirectory(absoluteDirectory)

  const watcher = chokidar.watch(absoluteDirectory, {
    ignored: /(^|[\/\\])\../,
    ignoreInitial: true,
    persistent: true,
  })

  const pendingUnlinks = new Set<string>()

  watcher.on('all', async (event, changedPath) => {
    const startsWithNumber = /^\d+/.test(path.basename(changedPath))

    if (!startsWithNumber) {
      return
    }

    const parentDirectory = path.dirname(changedPath)
    let forcedRename = null

    if (event === 'unlink') {
      pendingUnlinks.add(path.basename(changedPath))
    } else if (event === 'add') {
      const existingName = path.basename(changedPath)
      const items = await fs.readdir(parentDirectory)

      const duplicateItems = items.filter((item) => {
        const numberA = getFirstNumberInString(item)
        const numberB = getFirstNumberInString(existingName)
        return item !== existingName && numberA === numberB
      })

      // Rename the duplicate item to the name of the deleted item
      if (pendingUnlinks.has(existingName)) {
        pendingUnlinks.delete(existingName)
      } else if (duplicateItems.length > 0) {
        forcedRename = { oldName: duplicateItems[0], newName: existingName }
      }
    }

    await processDirectory(parentDirectory, forcedRename)
  })
}
