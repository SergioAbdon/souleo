// TEMPORÁRIO — smoke da ficha com dado REAL (Sub-plano 4). Cria 1 paciente de
// teste com CPF pela Agenda, confere lista/ficha/timeline/edição e limpa a fila
// no fim. NÃO emite laudo. Apagar este arquivo depois de rodar.
import { test, expect, type Page } from '@playwright/test';

const NOME = 'E2E FICHA TESTE';
const CPF = '11144477735'; // CPF de teste (dígitos válidos), conta de teste
const NASC = '1980-03-25';

async function entrar(page: Page, destino: string) {
  await page.goto(destino);
  const gate = page.getByRole('heading', { name: 'Em qual local você está hoje?' });
  const nav = page.getByRole('navigation');
  await expect(nav.or(gate).first()).toBeVisible({ timeout: 30000 });
  if (await gate.isVisible()) await gate.locator('..').getByRole('button').first().click();
}

test('ficha com dado real: mascara na lista, CPF completo na ficha, timeline, edicao', async ({ page }) => {
  test.setTimeout(180000);
  page.on('dialog', d => d.accept());
  const erros: string[] = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    // 1) Cadastro pela Agenda (mesmo caminho do e2e da etapa 3)
    await entrar(page, '/agenda');
    await page.getByRole('button', { name: '+ Paciente' }).click();
    await page.locator('label:has-text("Nome completo") + input').fill(NOME);
    await page.locator('label:has-text("CPF") + input').fill(CPF);
    await page.locator('label:has-text("Nascimento") + input').fill(NASC);
    await page.locator('label:has-text("Tipo exame") + select').selectOption('eco_tt');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    const linhaFila = page.getByRole('row', { name: new RegExp(NOME) });
    await expect(linhaFila).toBeVisible({ timeout: 30000 });

    // 2) O nome na fila virou link pra ficha (Task 4)
    await linhaFila.getByRole('button', { name: NOME }).click();
    await expect(page).toHaveURL(/\/pacientes\/[^/]+$/, { timeout: 60000 });
    expect(page.url()).not.toContain('?');

    // 3) Ficha: CPF COMPLETO, idade calculada, timeline com o exame
    await expect(page.getByRole('button', { name: /Editar cadastro/ })).toBeVisible({ timeout: 30000 });
    const ficha = await page.locator('main').innerText();
    console.log('FICHA:', ficha.replace(/\n/g, ' | ').slice(0, 700));
    expect(ficha).toContain('111.444.777-35');
    expect(ficha).toMatch(/25\/03\/1980 \(4\d anos\)/);
    expect(ficha).toContain('Eco Transtorácico');
    expect(ficha).toContain('Aguardando');
    await expect(page.getByRole('link', { name: 'Ver na Agenda' })).toBeVisible();

    // 4) Edição na ficha: telefone + propagação do nome pros exames abertos
    await page.getByRole('button', { name: /Editar cadastro/ }).click();
    await page.locator('label:has-text("Telefone") + input').fill('(91) 98888-7777');
    await page.getByRole('button', { name: /Salvar/ }).click();
    await expect(page.getByRole('heading', { name: /Editar cadastro/ })).toHaveCount(0, { timeout: 30000 });
    await expect(page.locator('main')).toContainText('(91) 98888-7777', { timeout: 20000 });
    console.log('EDICAO OK — telefone gravado e ficha recarregada');

    // 5) Lista: CPF MASCARADO
    await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click();
    await expect(page).toHaveURL(/\/pacientes$/, { timeout: 60000 });
    await page.getByPlaceholder(/Buscar/i).fill(CPF.slice(0, 6));
    const linha = page.getByRole('row').filter({ hasText: NOME });
    await expect(linha).toBeVisible({ timeout: 20000 });
    const txt = (await linha.innerText()).replace(/\n/g, ' | ');
    console.log('LINHA DA LISTA:', txt);
    expect(txt).toContain('***.***.***-35');
    expect(txt).not.toContain('111.444.777');
    expect(txt).toContain('25/03/1980');
    console.log('BUSCA POR CPF OK (digitos) + mascara OK');
  } finally {
    await entrar(page, '/agenda');
    const row = page.getByRole('row', { name: new RegExp(NOME) });
    await expect(row.or(page.getByRole('heading', { name: 'Agenda do dia' })).first()).toBeVisible({ timeout: 30000 });
    if (await row.count() === 1) {
      await row.getByRole('button', { name: '🗑' }).click();
      await expect(row).toHaveCount(0, { timeout: 20000 });
      console.log('LIMPEZA: exame de teste removido da fila');
    } else {
      console.log('LIMPEZA: nada a remover (count=' + (await row.count()) + ')');
    }
    console.log('ERROS DE CONSOLE:', erros.length ? erros.join(' || ') : 'nenhum');
  }
});
