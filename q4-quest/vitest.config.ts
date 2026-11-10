import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.ts', 'game/**/*.test.ts'],
    environment: 'node',
  },
});
