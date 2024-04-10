export const BASE_URL =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:4000'
    : `https://${process.env.VERCEL_URL}`
