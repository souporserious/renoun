const { parentPort } = require('worker_threads')
const { Project } = require('ts-morph')

let project = null

parentPort?.on('message', (message) => {
  if (message.type === 'createProject') {
    project = new Project(message.options)
  } else if (message.type === 'createOrUpdateFile' && project) {
    const { filePath, filename, lineStart, codeString } = message
    const sourceFile = project.createSourceFile(filename, codeString, {
      overwrite: true,
    })
    reportDiagnostics(sourceFile, filePath, lineStart)
  }
})

function reportDiagnostics(sourceFile, filePath, lineStart) {
  const diagnostics = sourceFile.getPreEmitDiagnostics()

  if (
    diagnostics.length === 0 ||
    sourceFile.getFullText().includes('showErrors')
  ) {
    return
  }

  console.log(
    `\n❌ ${diagnostics.length} error${
      diagnostics.length > 1 ? 's' : ''
    } in the following code blocks:\n`
  )

  diagnostics.forEach((diagnostic) => {
    const message = diagnostic.getMessageText()
    const { line, column } = sourceFile.getLineAndColumnAtPos(
      diagnostic.getStart()
    )
    const sourcePath = `vscode://file/${filePath}:${lineStart + line}:${column}`

    console.log(`${sourcePath}`)
    console.log(`${getDiagnosticMessageText(message)}\n`)
  })
}

function getDiagnosticMessageText(message) {
  if (typeof message === 'string') {
    return message
  } else {
    const nextMessage = message.getNext()
    let result = message.getMessageText()

    if (Array.isArray(nextMessage)) {
      for (const msg of nextMessage) {
        result += '\n' + getDiagnosticMessageText(msg)
      }
    } else if (nextMessage) {
      result += '\n' + getDiagnosticMessageText(nextMessage)
    }

    return result
  }
}
