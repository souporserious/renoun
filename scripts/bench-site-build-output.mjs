function parseCacheOperation(line) {
  const telemetryMatch = line.match(
    /\btelemetry:renoun\.cache\.(hit|miss|set|clear)\b/i
  )
  if (telemetryMatch) {
    return telemetryMatch[1].toLowerCase()
  }

  const legacyMatch = line.match(/\[cache\]\s+Cache (hit|miss|set|clear)\b/i)
  if (legacyMatch) {
    return legacyMatch[1].toLowerCase()
  }

  return undefined
}

export function stripAnsi(value) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]/g,
    ''
  )
}

export function createOutputParser() {
  let buffer = ''
  const lines = []
  let compileSeconds
  let staticSeconds
  let routeTotal
  let cacheHits = 0
  let cacheMisses = 0
  let cacheSets = 0
  let cacheClears = 0

  function processLine(rawLine) {
    const line = stripAnsi(rawLine)
      .replace(/\u0008/g, '')
      .trimEnd()
    if (line.length === 0) {
      return
    }

    lines.push(line)
    if (lines.length > 250) {
      lines.shift()
    }

    const compileMatch = line.match(
      /Compiled successfully in (\d+(?:\.\d+)?)s/i
    )
    if (compileMatch) {
      compileSeconds = Number.parseFloat(compileMatch[1])
    }

    const staticMatch = line.match(
      /Generating static pages(?:.*?)in (\d+(?:\.\d+)?)s/i
    )
    if (staticMatch) {
      staticSeconds = Number.parseFloat(staticMatch[1])
    }

    const routeMatch = line.match(
      /Generating static pages .*?\((\d+)\/(\d+)\)/i
    )
    if (routeMatch) {
      routeTotal = Number.parseInt(routeMatch[2], 10)
    }

    const cacheOperation = parseCacheOperation(line)
    if (cacheOperation === 'hit') {
      cacheHits += 1
    } else if (cacheOperation === 'miss') {
      cacheMisses += 1
    } else if (cacheOperation === 'set') {
      cacheSets += 1
    } else if (cacheOperation === 'clear') {
      cacheClears += 1
    }
  }

  return {
    write(text) {
      const normalized = text.replace(/\r/g, '\n')
      buffer += normalized
      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) {
          break
        }

        const line = buffer.slice(0, newlineIndex)
        processLine(line)
        buffer = buffer.slice(newlineIndex + 1)
      }
    },
    finish() {
      if (buffer.length > 0) {
        processLine(buffer)
        buffer = ''
      }

      return {
        compileSeconds,
        staticSeconds,
        routeTotal,
        cacheHits,
        cacheMisses,
        cacheSets,
        cacheClears,
        lastLines: [...lines],
      }
    },
  }
}
