import chokidar from 'chokidar'
import { Project } from 'ts-morph'

export function createWatcher(
  project: Project,
  onUpdate: (path: null | string) => Promise<void>
) {
  const watcher = chokidar.watch(
    project.getSourceFiles().map((sourceFile) => sourceFile.getFilePath()),
    { ignoreInitial: true }
  )

  onUpdate(null)

  watcher.on('add', function (addedPath) {
    project.addSourceFileAtPath(addedPath)

    onUpdate(addedPath)
  })

  watcher.on('unlink', function (removedPath) {
    const removedSourceFile = project.getSourceFile(removedPath)

    if (removedSourceFile) {
      project.removeSourceFile(removedSourceFile)
    }

    onUpdate(removedPath)
  })

  watcher.on('change', async function (changedPath) {
    const changedSourceFile = project.getSourceFile(changedPath)

    if (changedSourceFile) {
      await changedSourceFile.refreshFromFileSystem()
    }

    onUpdate(changedPath)
  })
}
