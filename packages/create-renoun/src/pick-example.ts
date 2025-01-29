import { createInterface } from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'
import { moveCursor, clearLine } from 'node:readline'
import process from 'node:process'
import chalk from 'chalk'

interface Key {
  sequence: string
  name: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  code?: string
}

export async function pickExample({ options }: { options: string[] }) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  emitKeypressEvents(process.stdin)

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }

  let selectedIndex = 0
  let lastRenderLineCount = 0

  function render() {
    // Move the cursor back up to where we last printed, then clear those lines
    for (let index = 0; index < lastRenderLineCount; index++) {
      moveCursor(process.stdout, 0, -1)
      clearLine(process.stdout, 0)
    }

    const lines: string[] = []

    lines.push(
      chalk.bold('\nSelect an example below to clone and get started:\n')
    )

    for (let index = 0; index < options.length; index++) {
      if (index === selectedIndex) {
        lines.push(chalk.cyan(`> ${options[index]}`))
      } else {
        lines.push(`  ${options[index]}`)
      }
    }

    lines.push(
      chalk.dim('\nUse ↑ / ↓ to move, Enter to select, Ctrl+C to exit.')
    )

    const output = lines.join('\n')
    process.stdout.write(output + '\n')

    const newlineCount = (output.match(/\n/g) || []).length
    lastRenderLineCount = newlineCount + 1
  }

  render()

  return new Promise<string>((resolve, reject) => {
    function onKeyPress(_string: string, key: Key) {
      if (!key) return

      switch (key.name) {
        case 'up':
          selectedIndex = (selectedIndex - 1 + options.length) % options.length
          render()
          break
        case 'down':
          selectedIndex = (selectedIndex + 1) % options.length
          render()
          break
        case 'return':
          cleanup()
          resolve(options[selectedIndex])
          break
        default:
          if (key.ctrl && key.name === 'c') {
            cleanup()
            reject(new Error('User aborted'))
          }
      }
    }

    function cleanup() {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      process.stdin.off('keypress', onKeyPress)
      readline.close()

      // Clear the picker on exit
      for (let index = 0; index < lastRenderLineCount; index++) {
        moveCursor(process.stdout, 0, -1)
        clearLine(process.stdout, 0)
      }
    }

    process.stdin.on('keypress', onKeyPress)
  })
}
