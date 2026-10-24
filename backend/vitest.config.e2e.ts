import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/test-env.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: TEST_ENV,
    globalSetup: ['./test/global-setup.ts'],
    // Test files share one database, so they must not run in parallel.
    fileParallelism: false,
  },
});
