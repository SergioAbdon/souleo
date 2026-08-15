// Playwright E2E do LEO — roda contra o dev server local (Firebase de produção,
// conta de teste). Autenticação via estado salvo UMA vez pelo Sergio
// (tests/e2e/auth.setup.md). Sem o estado, os testes dão SKIP limpo.
import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const AUTH_FILE = path.join(__dirname, 'tests', 'e2e', '.auth', 'state.json');

export default defineConfig({
  testDir: 'tests/e2e',
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    // Edge do Windows (é Chromium): o Chromium baixado pelo Playwright falha
    // nesta máquina (side-by-side / runtime VC++ ausente).
    channel: 'msedge',
    // Só aponta o storageState se o arquivo existir — com o caminho fixo e o
    // arquivo ausente, o Playwright erra ANTES do test.skip rodar.
    ...(fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}),
  },
  webServer: {
    command: 'npx next dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
