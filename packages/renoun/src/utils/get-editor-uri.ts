export type Editors =
  | 'vscode'
  | 'vscode-insiders'
  | 'vscodium'
  | 'android-studio'
  | 'idea'
  | 'phpstorm'
  | 'webstorm'
  | 'sublime'
  | 'textmate'

export type GetEditorUriOptions = {
  /** Path of the file to be opened. */
  path: string

  /** Line to be focused. */
  line?: number

  /** Column to be focused. */
  column?: number

  /** The IDE the file should be opened in. */
  editor?: Editors
}

/** Constructs a URI path for the configured IDE. */
export function getEditorUri({
  path,
  line = 0,
  column = 0,
  editor = 'vscode',
}: GetEditorUriOptions): string {
  switch (editor) {
    case 'vscode':
    case 'vscode-insiders':
    case 'vscodium':
      return `${editor}://file/${path}:${line}:${column}`

    case 'android-studio':
    case 'idea':
    case 'phpstorm':
    case 'webstorm':
      return `jetbrains://${editor}/navigate/reference?file=${path}&line=${line}${column ? `&column=${column}` : ''}`

    case 'sublime':
      return `subl://open?url=file://${path}&line=${line}&column=${column}`

    case 'textmate':
      return `txmt://open?url=file://${path}&line=${line}&column=${column}`

    default:
      throw new Error(
        `Unsupported editor: ${editor}. Supported editors are: vscode, vscode-insiders, vscodium, sublime, phpstorm, webstorm, idea, android-studio, textmate.`
      )
  }
}
