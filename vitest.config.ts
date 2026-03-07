import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'mcp/**/*.test.ts',
      'test/**/*.test.ts',
      'ui/src/**/*.test.ts',
      'ui/src/**/*.test.tsx'
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: [
        'src/types/hook.ts',
        'ui/src/utils/feedback.ts',
        'ui/src/utils/parser.ts',
        'ui/src/utils/annotationHelpers.ts',
      ],
      exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90
      },
      reporter: ['text', 'text-summary', 'json-summary']
    }
  }
})
