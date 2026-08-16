// TEMPORÁRIO — smoke da seção Pacientes (Sub-plano 4). READ-ONLY: não cadastra,
// não salva, não emite. Apagar depois de rodar.
import { test, expect, type Page } from '@playwright/test';

async function entrar(page: Page, destino: string) {
  await page.goto(destino);
  const gate = page.getByRole('heading', { name: 'Em qual local você está hoje?' });
  const nav = page.getByRole('navigation');
  await expect(nav.or(gate).first()).toBeVisible({ timeout: 30000 });
  if (await gate.isVisible()) await gate.locator('..').getByRole('button').first().click();
}

test('smoke pacientes: nav, lista com CPF mascarado, ficha, timeline, modal', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });

  await entrar(page, '/agenda');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Pacientes' })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click();
  await expect(page).toHaveURL(/\/pacientes/, { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();

  const linhas = page.getByRole('row');
  await expect(linhas.first()).toBeVisible({ timeout: 30000 }); // espera a carga
  const total = await linhas.count();
  console.log('LINHAS NA LISTA (com cabecalho):', total);
  expect(total).toBeGreaterThan(1);

  // CPF mascarado na lista: nenhum CPF completo visível
  const corpo = await page.locator('table').innerText();
  expect(corpo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  console.log('MASCARA OK — amostra:', corpo.split('\n').slice(0, 6).join(' | '));

  // Busca por nome (primeiras 4 letras do primeiro paciente)
  const primeiroNome = (await linhas.nth(1).innerText()).split('\t')[0].trim();
  await page.getByPlaceholder(/Buscar/i).fill(primeiroNome.slice(0, 4));
  await expect(page.getByRole('row')).not.toHaveCount(total + 1);
  console.log('BUSCA OK com termo:', primeiroNome.slice(0, 4));

  // Abrir ficha de um paciente REAL (primeira linha com CPF mascarado)
  await page.getByPlaceholder(/Buscar/i).fill('');
  await expect(linhas.first()).toBeVisible();
  const real = page.getByRole('row').filter({ hasText: /\*\*\*\.\*\*\*\.\*\*\*-\d\d/ }).first();
  await expect(real).toBeVisible({ timeout: 15000 });
  console.log('LINHA REAL:', (await real.innerText()).replace(/\n/g, ' | '));
  await real.getByRole('button', { name: /Abrir ficha/i }).click();
  await expect(page).toHaveURL(/\/pacientes\/[^/]+$/, { timeout: 60000 });
  const url = page.url();
  console.log('URL DA FICHA:', url);
  expect(url).not.toContain('?'); // nenhum dado de paciente em query string

  await expect(page.getByRole('button', { name: /Editar cadastro/ })).toBeVisible({ timeout: 20000 });
  const ficha = await page.locator('main').innerText();
  console.log('FICHA:', ficha.replace(/\n/g, ' | ').slice(0, 900));
  expect(ficha).not.toContain('Não realizado'); // filtrados fora da timeline

  // Modal abre e fecha SEM salvar
  await page.getByRole('button', { name: /Editar cadastro/ }).click();
  await expect(page.getByRole('heading', { name: /Editar cadastro/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: /Editar cadastro/ })).toHaveCount(0);

  console.log('ERROS DE CONSOLE:', erros.length ? erros.join(' || ') : 'nenhum');
});
