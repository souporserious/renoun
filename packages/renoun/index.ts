
import { createCollection } from 'renoun/collections'

const posts = createCollection('posts/*.md', {
    importMap: []
})

const components = createCollection('components/*.md', {
    importMap: [],
    tsConfigFilePath: 'tsconfig.json',
})
