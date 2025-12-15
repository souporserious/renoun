import { spawn } from 'node:child_process'

const tsc = spawn('pnpm', ['tsc', '-w'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
})

tsc.stdout.on('data', (data) => {
  const str = data.toString()
  process.stdout.write(str)

  // tsc prints this on successful compilation
  if (str.includes('Watching for file changes.')) {
    console.log('\n→ Running post-build script...')
    const child = spawn('node', ['./scripts/patch-load-package.ts'], {
      stdio: 'inherit',
      shell: true,
    })
    child.on('error', (err) => console.error('Post-build error:', err))
  }
})

tsc.stderr.on('data', (data) => {
  process.stderr.write(data)
})

tsc.on('close', (code) => {
  process.exit(code)
})

process.on('SIGINT', () => {
  tsc.kill()
  process.exit()
})
