module.exports = {
  testEnvironment: 'node',
  transformIgnorePatterns: ['!node_modules/'],
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
}
