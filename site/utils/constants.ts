export const BASE_URL =
  process.env.VERCEL_ENV === 'production'
    ? process.env.MDXTS_SITE_URL
    : process.env.NODE_ENV === 'production'
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:4000'
