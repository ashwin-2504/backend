import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/ondc-mock-server/**',
    ],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
