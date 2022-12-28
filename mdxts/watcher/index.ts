import chokidar from 'chokidar'
import { Project } from 'ts-morph'

// TODO: watcher should initiate watched files and updated source files
export function createWatcher(
  project: Project,
  onUpdate: (path: string) => Promise<any>
) {
  const watcher = chokidar.watch(
    project.getSourceFiles().map((sourceFile) => sourceFile.getFilePath()),
    {
      ignoreInitial: true,
      ignored: `${process.cwd()}/.mdxts`,
    }
  )

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
