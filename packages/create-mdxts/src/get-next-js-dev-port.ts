import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function extractPort(script: string) {
  const portRegex = /next dev.*(?:-p |--port )(\d+)/
  const match = script.match(portRegex)
  return match ? match[1] : null
}

/* Read package.json and parse the Next.js port number */
export function getNextJsDevPort() {
  const packageJsonPath = resolve(process.cwd(), 'package.json')
  const packageJson = readFileSync(packageJsonPath, 'utf8')
  const config = JSON.parse(packageJson) as {
    scripts?: Record<string, string>
  }

  if (config.scripts) {
    for (const value of Object.values(config.scripts)) {
      if (value.includes('next dev')) {
        const port = extractPort(value)
        if (port) {
          return parseInt(port)
        }
      }
    }
  }

  return 3000
}
