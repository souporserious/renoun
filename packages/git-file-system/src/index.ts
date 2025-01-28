import {clone} from "isomorphic-git"
import path from "path"
import fs from "fs/promises"
import http from "isomorphic-git/http/node";


export type LoadContentProps = {
  repository: string
  branch?: string
  credentials?: {
    username: string
    token: string
  }
  cacheDirectory?: string
  proxy?: string
}

export async function loadContent(props: LoadContentProps) {

  const cloneConfig = createCloneConfig(props)

  console.dir(cloneConfig, {depth: null})
  
}


// Creates the configuration to run the `clone` command
export function createCloneConfig(props: LoadContentProps) {

  // specify the default cache directory
  // it's used to save the files locally
  // TODO: check if this is needed, maybe we can pass a custom `fs` to the clone command
  //       to save the file content in memory, but for now, we will save them locally
  const defaultCacheDir = path.join(process.cwd(), '.renoun', 'cache', 'git')

 
  const gitConfig: Parameters<typeof clone>[number] = {
    singleBranch: true,
    depth: 1,
    url: props.repository,
    corsProxy: props.proxy,
    dir: props.cacheDirectory ?? defaultCacheDir,
    fs,
    http,
    onAuth: props.credentials ? () => {
      return { username: props.credentials?.username, password: props.credentials?.token }
    } : undefined
  }

  return gitConfig
}