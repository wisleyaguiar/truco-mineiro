import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // As simulações de milhares de partidas passam de 5s quando rodam em paralelo.
    testTimeout: 60_000,
  },
});
