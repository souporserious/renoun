import chokidar from 'chokidar'
import { Project } from 'ts-morph'

export function createWatcher(
  project: Project,
  loaderPaths: string[],
  onUpdate: (path: string) => Promise<any>
) {
  const watcher = chokidar.watch(
    loaderPaths.concat(
      project.getSourceFiles().map((sourceFile) => sourceFile.getFilePath())
    ),
    {
      ignoreInitial: true,
      ignored: `${process.cwd()}/.mdxts`,
    }
  )

  watcher.on('add', function (addedPath) {
    if (!loaderPaths.includes(addedPath)) {
      project.addSourceFileAtPath(addedPath)
    }

    onUpdate(addedPath)
  })

  watcher.on('unlink', function (removedPath) {
    if (!loaderPaths.includes(removedPath)) {
      const removedSourceFile = project.getSourceFile(removedPath)

      if (removedSourceFile) {
        project.removeSourceFile(removedSourceFile)
      }
    }

    onUpdate(removedPath)
  })

  watcher.on('change', async function (changedPath) {
    if (!loaderPaths.includes(changedPath)) {
      const changedSourceFile = project.getSourceFile(changedPath)

      if (changedSourceFile) {
        await changedSourceFile.refreshFromFileSystem()
      }
    }

    onUpdate(changedPath)
  })
}
