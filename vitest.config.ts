import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'test/**/*.test.ts',
      'ui/src/**/*.test.ts',
      'ui/src/**/*.test.tsx'
    ],
    exclude: ['node_modules', 'dist']
  }
})
