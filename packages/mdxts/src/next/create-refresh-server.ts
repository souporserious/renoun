import chokidar from 'chokidar'
import WebSocket from 'ws'

/** Create a WebSocket server that listens for file changes and sends a message to all connected ContentRefresh components to refresh the page. */
export async function createRefreshServer() {
  const wss = new WebSocket.Server({ port: 0 })
  const watcher = chokidar.watch([], {
    ignored: [/(^|[/\\])\../, /node_modules/],
    ignoreInitial: true,
  })
  let sockets: WebSocket[] = []
  let watchedPaths: string[] = []

  watcher.on('change', () => {
    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'refresh' }))
      }
    })
  })

  watcher.on('error', (error) => console.error('mdxts watcher error: ', error))

  const updateWatchedPaths = (newPaths: string[]) => {
    const pathsToAdd = newPaths.filter((path) => !watchedPaths.includes(path))
    const pathsToRemove = watchedPaths.filter(
      (path) => !newPaths.includes(path)
    )

    if (pathsToAdd.length) {
      watcher.add(pathsToAdd)
    }

    if (pathsToRemove.length) {
      watcher.unwatch(pathsToRemove)
    }

    watchedPaths = newPaths
  }

  wss.on('connection', (ws) => {
    sockets.push(ws)

    ws.on('message', (message) => {
      const { mdxPath, tsPath } = JSON.parse(message.toString())
      updateWatchedPaths([mdxPath, tsPath].filter(Boolean))
    })

    ws.on('close', () => {
      sockets = sockets.filter((s) => s !== ws)
    })
  })

  await new Promise((resolve, reject) => {
    wss.on('listening', resolve)
    wss.on('error', reject)
    wss.on('close', reject)
  })

  return wss
}
