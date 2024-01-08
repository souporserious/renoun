import chokidar from 'chokidar'
import { Project } from 'ts-morph'

export function createWatcher(
  project: Project,
  loaderPaths: string[],
  onUpdate: (path: string) => Promise<any>
) {
  const watcher = chokidar.watch(
    loaderPaths
      .concat(
        project.getSourceFiles().map((sourceFile) => sourceFile.getFilePath())
      )
      .filter(
        (path) =>
          !path.includes('node_modules') &&
          !path.includes('dist') &&
          !path.includes('.next') &&
          !path.includes('.turbo')
      ),
    { ignoreInitial: true }
  )

  watcher.on('add', function (addedPath) {
    console.log('Added path to watcher: ', addedPath)

    if (!loaderPaths.includes(addedPath)) {
      project.addSourceFileAtPath(addedPath)
    }

    onUpdate(addedPath)
  })

  watcher.on('unlink', function (removedPath) {
    console.log('Removed path from watcher: ', removedPath)

    if (!loaderPaths.includes(removedPath)) {
      const removedSourceFile = project.getSourceFile(removedPath)

      if (removedSourceFile) {
        project.removeSourceFile(removedSourceFile)
      }
    }

    onUpdate(removedPath)
  })

  watcher.on('change', async function (changedPath) {
    console.log('Changed path in watcher: ', changedPath)

    if (!loaderPaths.includes(changedPath)) {
      const changedSourceFile = project.getSourceFile(changedPath)

      if (changedSourceFile) {
        await changedSourceFile.refreshFromFileSystem()
      }
    }

    onUpdate(changedPath)
  })
}
