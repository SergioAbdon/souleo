import { defineConfig } from 'vitest/config';

// Wader é backend Node — sem CSS/PostCSS. Inline `css.postcss` vazio impede o
// vitest de subir e achar o postcss.config.mjs do repo-pai (Next.js/Tailwind),
// que não tem deps instaladas aqui e quebrava a coleta de testes.
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
