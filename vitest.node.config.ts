import { defineConfig } from 'vitest/config';

/**
 * Segunda vía de tests: TypeScript puro en Node, sin Angular ni jsdom.
 * Aquí corren los tests que necesitan SQLite real (`node:sqlite`) y los
 * scripts de siembra/benchmark. Los tests de componentes siguen en `ng test`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.node.spec.ts', 'tools/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tools/vitest.node.setup.ts'],
  },
});
