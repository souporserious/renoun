import { Command } from 'renoun'

export function InstallExample() {
  return <Command variant="install">renoun</Command>
}

export function InstallDevExample() {
  return <Command variant="install-dev">@types/react @types/react-dom</Command>
}

export function RunExample() {
  return <Command variant="run">dev</Command>
}

export function ExecExample() {
  return <Command variant="exec">create-renoun --example=docs</Command>
}

export function CreateExample() {
  return <Command variant="create">renoun</Command>
}
