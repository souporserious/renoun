import { describe, expect, test } from 'vitest'

import { patchAnalysisClientText } from './patch-analysis-client.ts'

describe('patchAnalysisClientText', () => {
  test('replaces the server-only analysis import with a runtime import thunk', () => {
    const input = `function shouldLoadBrowserAnalysisClientServerModule() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}
async function importAnalysisClientServerModules() {
    if (shouldLoadBrowserAnalysisClientServerModule()) {
        if (isSourceAnalysisClientModule()) {
            return import("./client.server.browser.js");
        }
        return import('./client.server.browser.js');
    }
    if (isSourceAnalysisClientModule()) {
        return import("./client.server.js");
    }
    return import('./client.server.js');
}
async function loadAnalysisClientServerModules() {
    return undefined;
}
`

    const output = patchAnalysisClientText(input)

    expect(output).toContain(
      "async function importAnalysisClientServerModuleAtRuntime() {"
    )
    expect(output).toContain(
      "const packageEntryPath = require.resolve('renoun');"
    )
    expect(output).toContain(
      "return importAnalysisClientServerModuleAtRuntime();"
    )
    expect(output).not.toContain('return import(\'./client.server.js\');')
    expect(output).toContain('async function loadAnalysisClientServerModules() {')
  })
})
