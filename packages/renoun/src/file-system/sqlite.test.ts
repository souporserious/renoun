import { expect, test } from 'vitest'

import { loadSqliteModule } from './sqlite.ts'

test('restores process.emitWarning after loading sqlite module', async () => {
  const originalEmitWarning = process.emitWarning

  await loadSqliteModule()

  expect(process.emitWarning).toBe(originalEmitWarning)
})
