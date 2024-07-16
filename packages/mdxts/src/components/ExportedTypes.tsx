import React from 'react'
import { isAbsolute, join } from 'node:path'
import type { AllTypes, TypeByKind } from '@tsxmod/utils'

import { getExportedTypes } from '../utils/get-exported-types'
import { Context } from './Context'
import { project } from './project'

export type ExportedTypesMetadata = ReturnType<typeof getExportedTypes>

export type ExportedTypeOfKind<Key extends AllTypes['kind']> = TypeByKind<
  AllTypes,
  Key
>

type BaseExportedTypesProps = {
  /** Controls how types are rendered. */
  children: (exportedTypes: ExportedTypesMetadata) => React.ReactNode
}

type ExportedTypesProps =
  | ({ source: string } & BaseExportedTypesProps)
  | ({ filename: string; value: string } & BaseExportedTypesProps)

/** Displays type documentation for all exported types from a module or source code value. */
export function ExportedTypes(props: ExportedTypesProps) {
  /** Private props are added from mdxts/remark and mdxts/loader. */
  const privateProps = props as {
    workingDirectory?: string
  }
  let sourcePropPath

  if ('source' in props) {
    const isRelative = !isAbsolute(props.source)
    const workingDirectory = privateProps.workingDirectory

    if (isRelative && !workingDirectory) {
      throw new Error(
        'The [workingDirectory] prop was not provided to the [ExportedTypes] component while using a relative path. Pass a valid [workingDirectory] or make sure the mdxts/remark plugin for MDX files and mdxts/loader for JavaScript/TypeScript files are configured correctly.'
      )
    }

    sourcePropPath = isRelative
      ? join(workingDirectory!, props.source)
      : props.source
  }

  const sourceFile =
    'source' in props
      ? project.addSourceFileAtPath(sourcePropPath!) // TODO: there's currently diagnostic errors when this is outside the current project since not all files are loaded. Need to handle multiple projects.
      : project.createSourceFile(props.filename, props.value, {
          overwrite: true,
        })
  const exportedTypes = getExportedTypes(sourceFile)

  return (
    <Context value={{ workingDirectory: privateProps.workingDirectory }}>
      {props.children(exportedTypes)}
    </Context>
  )
}
