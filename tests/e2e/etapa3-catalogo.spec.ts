// E2E da Etapa 3 (catálogo de tipos de laudo) — READ-ONLY ou reversível.
// Roda contra o Firebase de PRODUÇÃO com a conta de teste: NUNCA emitir laudo
// (consome franquia) nem apagar dados que os testes não criaram.
// Requer o estado de login salvo (tests/e2e/auth.setup.md) — sem ele, SKIP.
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth', 'state.json');

// Navega já tratando o gate "Em qual local você está hoje?" (contas com 2+ locais).
async function entrar(page: Page, destino: string) {
  await page.goto(destino);
  const gate = page.getByRole('heading', { name: 'Em qual local você está hoje?' });
  const nav = page.getByRole('navigation');
  await expect(nav.or(gate).first()).toBeVisible({ timeout: 30000 });
  if (await gate.isVisible()) {
    await gate.locator('..').getByRole('button').first().click();
  }
}

// Cadastra paciente de teste pela Agenda e espera a linha aparecer na fila.
async function cadastrarPaciente(page: Page, nome: string, tipoId: string) {
  await entrar(page, '/agenda');
  await page.getByRole('button', { name: '+ Paciente' }).click();
  await page.locator('label:has-text("Nome completo") + input').fill(nome);
  await page.locator('label:has-text("Tipo exame") + select').selectOption(tipoId);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toBeVisible({ timeout: 20000 });
}

// Limpeza best-effort: remove da fila o exame de teste, se ainda estiver lá.
// (O confirm() do 🗑 é aceito pelo handler de dialog registrado no teste.)
async function limparDaFila(page: Page, nome: string) {
  await entrar(page, '/agenda');
  const row = page.getByRole('row', { name: new RegExp(nome) });
  if (await row.count() === 0) return;
  await row.getByRole('button', { name: '🗑' }).click();
  await expect(row).toHaveCount(0, { timeout: 20000 });
}

test.describe('Etapa 3 — catálogo de tipos de laudo', () => {
  test.skip(!fs.existsSync(AUTH_FILE),
    'Sem estado de login em tests/e2e/.auth/state.json — rode "npm run dev" + "npm run test:e2e:login" (ver tests/e2e/auth.setup.md).');

  test('shell: sidebar com 4 seções e navegação por URL', async ({ page }) => {
    await entrar(page, '/agenda');
    await expect(page.getByRole('heading', { name: 'Agenda do dia' })).toBeVisible();
    const nav = page.getByRole('navigation');
    for (const rotulo of ['Agenda', 'Laudos', 'Financeiro', 'Clínica']) {
      await expect(nav.getByRole('link', { name: rotulo })).toBeVisible();
    }
    await nav.getByRole('link', { name: 'Laudos' }).click();
    await expect(page).toHaveURL(/\/laudos/);
    await nav.getByRole('link', { name: 'Financeiro' }).click();
    await expect(page).toHaveURL(/\/financeiro/);
    await nav.getByRole('link', { name: 'Clínica' }).click();
    await expect(page).toHaveURL(/\/clinica/);
    await page.goBack();
    await expect(page).toHaveURL(/\/financeiro/);
  });

  test('clinica: aba Tipos de laudo lista os 8 tipos padrão', async ({ page }) => {
    await entrar(page, '/clinica');
    await page.getByRole('button', { name: 'Tipos de laudo' }).click();
    for (const nome of ['Eco Transtorácico', 'Doppler de Carótidas', 'ECG', 'MAPA', 'Holter', 'Teste Ergométrico']) {
      await expect(page.getByRole('button', { name: nome, exact: true })).toBeVisible({ timeout: 15000 });
    }
    // Pílulas de modalidade (existem várias de cada — basta uma visível)
    await expect(page.getByText('Motor Senna').first()).toBeVisible();
    await expect(page.getByText('Texto com modelo').first()).toBeVisible();
    await expect(page.getByText('PDF anexado').first()).toBeVisible();
  });

  test('agenda: select de cadastro lista tipos do catálogo', async ({ page }) => {
    await entrar(page, '/agenda');
    await page.getByRole('button', { name: '+ Paciente' }).click();
    await expect(page.getByRole('heading', { name: 'Novo Paciente' })).toBeVisible();
    const select = page.locator('label:has-text("Tipo exame") + select');
    await expect(select.locator('option', { hasText: 'Doppler de Carótidas' })).toHaveCount(1);
    await expect(select.locator('option', { hasText: 'ECG' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Cancelar' }).click(); // NÃO salvar
    await expect(page.getByRole('heading', { name: 'Novo Paciente' })).toHaveCount(0);
  });

  test('carotidas: fluxo até o editor com modelo', async ({ page }) => {
    page.on('dialog', d => d.accept()); // confirm() do 🗑 na limpeza
    const NOME = 'E2E TESTE CAROTIDAS';
    try {
      await cadastrarPaciente(page, NOME, 'doppler_carotidas');
      const row = page.getByRole('row', { name: new RegExp(NOME) });
      await row.getByRole('button', { name: 'Laudar' }).click();
      await page.waitForURL(/\/laudo-texto\//, { timeout: 20000 });
      // Modelo do catálogo carregado no editor TipTap
      await expect(page.locator('h2', { hasText: 'DOPPLER DE CARÓTIDAS E VERTEBRAIS' }))
        .toBeVisible({ timeout: 15000 });
      // VOLTAR sem emitir (emitir consome franquia)
      await page.getByRole('button', { name: 'Voltar para a agenda' }).click();
      await page.waitForURL(/\/agenda/);
    } finally {
      await limparDaFila(page, NOME);
    }
  });

  test('pdf: modal de anexar abre e fecha', async ({ page }) => {
    page.on('dialog', d => d.accept());
    const NOME = 'E2E TESTE ECG';
    try {
      await cadastrarPaciente(page, NOME, 'ecg');
      const row = page.getByRole('row', { name: new RegExp(NOME) });
      await row.getByRole('button', { name: 'Laudar' }).click();
      const modal = page.getByRole('heading', { name: 'Anexar PDF' });
      await expect(modal).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Cancelar' }).click(); // NÃO emitir
      await expect(modal).toHaveCount(0);
    } finally {
      await limparDaFila(page, NOME);
    }
  });
});
