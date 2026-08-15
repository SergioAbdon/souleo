// Salva o estado de login pros testes E2E (roda UMA vez, manual).
// Uso: com o dev server no ar (npm run dev), rode: npm run test:e2e:login
//
// Por que não `playwright codegen --save-storage`: o Firebase Auth guarda a
// sessão no IndexedDB, e o codegen salva o storageState SEM IndexedDB —
// o state.json sairia "vazio" e os testes cairiam no /login.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';

const AUTH_FILE = fileURLToPath(new URL('./.auth/state.json', import.meta.url));

// channel msedge: o Chromium baixado pelo Playwright falha nesta maquina
// (erro side-by-side, runtime VC++ ausente); o Edge do Windows e Chromium
// e sempre existe. Mesmo canal no playwright.config.ts.
const browser = await chromium.launch({ headless: false, channel: 'msedge' });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('http://localhost:3000/login');
console.log('Faça login com a conta de TESTE (Gmail PJ). Aguardando entrar na plataforma...');
await page.waitForURL(/\/(agenda|dashboard|laudos|financeiro|clinica)/, { timeout: 300000 });
await page.waitForTimeout(3000); // deixa o Firebase terminar de gravar o IndexedDB
await context.storageState({ path: AUTH_FILE, indexedDB: true });
await browser.close();
console.log(`Estado salvo em ${AUTH_FILE} — agora "npm run test:e2e" roda logado.`);
