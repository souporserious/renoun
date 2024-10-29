import { createServer } from 'renoun/server'

export async function register() {
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    createServer()
  }
}
