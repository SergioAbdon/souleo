// E2E do roteiro de fechamento da Seção 5 (Tela do Laudo) — conta de TESTE.
// Roda contra o Firebase de PRODUÇÃO com a conta de teste (Gmail).
// DIFERENTE do etapa3: este roteiro EMITE um laudo (necessário pras travas do
// emitido e correção administrativa) e CANCELA ao final — o cancelamento
// devolve o consumo (mecânica da Seção 1). Best-effort cleanup no finally.
// Requer o estado de login salvo (tests/e2e/auth.setup.md) — sem ele, SKIP.
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth', 'state.json');
// Sufixo único por rodada: exame de rodada anterior (com rascunho autosalvo)
// mudaria o estado inicial e o alvo dos cliques (lição do Sub-plano 4).
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
const NOME_A = `E2E S5A ${RUN}`;
const NOME_B = `E2E S5B ${RUN}`;

async function entrar(page: Page, destino: string) {
  await page.goto(destino);
  const gate = page.getByRole('heading', { name: 'Em qual local você está hoje?' });
  const nav = page.getByRole('navigation');
  await expect(nav.or(gate).first()).toBeVisible({ timeout: 30000 });
  if (await gate.isVisible()) {
    await gate.locator('..').getByRole('button').first().click();
  }
}

async function cadastrarPaciente(page: Page, nome: string, tipoId: string) {
  await entrar(page, '/agenda');
  await page.getByRole('button', { name: '+ Paciente' }).click();
  await page.locator('label:has-text("Nome completo") + input').fill(nome);
  await page.locator('label:has-text("Tipo exame") + select').selectOption(tipoId);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toBeVisible({ timeout: 20000 });
}

async function limparDaFila(page: Page, nome: string) {
  await entrar(page, '/agenda');
  const row = page.getByRole('row', { name: new RegExp(nome) });
  // Espera a fila carregar antes de contar (lição do Sub-plano 4).
  await page.waitForTimeout(2000);
  if (await row.count() === 0) return;
  const btn = row.getByRole('button', { name: '🗑' });
  if (await btn.count() === 0) return; // sem ação de remover (ex.: emitido)
  await btn.click();
  await expect(row).toHaveCount(0, { timeout: 20000 });
}

async function abrirLaudo(page: Page, nome: string) {
  await entrar(page, '/agenda');
  const row = page.getByRole('row', { name: new RegExp(nome) });
  await row.getByRole('button', { name: /Laudar|Continuar/ }).click();
  await page.waitForURL(/\/laudo\//, { timeout: 20000 });
  // Motor carregado DE VERDADE = window.calc + o wrapper React do
  // setDiastModo instalados (o #b9 nasce habilitado, não serve de sinal).
  // __setDiastModoOrig só existe depois que o WRAPPER React (quem abre o
  // painel) instalou — o setDiastModo cru do motor chega ~500ms antes.
  await page.waitForFunction(
    () => typeof (window as unknown as Record<string, unknown>).calc === 'function'
      && !!(window as unknown as Record<string, unknown>).__setDiastModoOrig,
    undefined, { timeout: 30000 },
  );
  await expect(page.locator('#b9')).toBeEnabled({ timeout: 10000 });
}

// Digita numa medida da sidebar disparando os eventos que o motor escuta.
// Tab tira o foco → change NATIVO borbulha até o listener delegado do
// #laudo-sidebar (dispatchEvent do Playwright não borbulha por padrão).
async function setMedida(page: Page, id: string, valor: string) {
  const el = page.locator(`#${id}`);
  await el.click();
  await el.fill(valor);
  await page.keyboard.press('Tab');
  // debounce do Senna90 (300ms) + rede da ponte
  await page.waitForTimeout(2500);
}

const editor = (page: Page) => page.locator('.ProseMirror').first();

test.describe.configure({ mode: 'serial' });

test.describe('Seção 5 — roteiro de fechamento', () => {
  test.skip(!fs.existsSync(AUTH_FILE),
    'Sem estado de login em tests/e2e/.auth/state.json — ver tests/e2e/auth.setup.md.');

  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept());
    // Produção roda com Senna90 primário (NEXT_PUBLIC_PRIMARY_ENGINE=senna90);
    // o dev local não tem a env — força pelo override oficial do flag.
    await page.addInitScript(() => localStorage.setItem('leo:primary-engine', 'senna90'));
  });

  test('setup: cadastra os 2 exames de eco do roteiro', async ({ page }) => {
    await cadastrarPaciente(page, NOME_A, 'eco_tt');
    await cadastrarPaciente(page, NOME_B, 'eco_tt');
  });

  test('item 2 — merge por linha: manual fica, edição cede ao motor', async ({ page }) => {
    await abrirLaudo(page, NOME_A);
    // sexo + DDVE alto → linha do VE aumentado
    await page.locator('#sexo').selectOption({ index: 1 });
    await setMedida(page, 'b9', '62');
    const ed = editor(page);
    await expect(ed).toContainText(/Ventrículo esquerdo/i, { timeout: 15000 });
    // Ancorada no INÍCIO: "Disfunção diastólica do ventrículo esquerdo..."
    // também contém a substring e roubaria o clique.
    const linhaVE = ed.locator('p', { hasText: /^Ventrículo esquerdo/ }).first();
    const textoAntes = await linhaVE.innerText();

    // (a) frase manual acrescentada sobrevive a mudança de medida
    await ed.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Janela acústica limitada.');
    await setMedida(page, 'b8', '44'); // átrio esquerdo muda → motor regenera
    await expect(ed).toContainText('Janela acústica limitada.', { timeout: 15000 });

    // (b) linha do motor editada + medida MUDA → versão nova do motor vence
    await linhaVE.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' com trabeculações');
    await expect(ed).toContainText('com trabeculações');
    await setMedida(page, 'b9', '70'); // DDVE muda de verdade
    await expect(ed).not.toContainText('com trabeculações', { timeout: 15000 });
    await expect(ed).toContainText(/Ventrículo esquerdo/i);
    // e a manual continua lá
    await expect(ed).toContainText('Janela acústica limitada.');
    // sem duplicação da linha do VE
    const nVE = await ed.locator('p', { hasText: /^Ventrículo esquerdo/ }).count();
    expect(nVE).toBe(1);
    expect(textoAntes.length).toBeGreaterThan(0);
  });

  test('item 3 — diastólica manual chega ao laudo e Limpar fecha o painel', async ({ page }) => {
    await abrirLaudo(page, NOME_A);
    await page.locator('#diast-btn-manual').click();
    await expect(page.locator('#diast-manual-panel')).toBeVisible();
    await page.locator('#diast-manual-sel').selectOption('1'); // grau I
    await page.waitForTimeout(1800);
    await expect(editor(page)).toContainText(/relaxamento/i, { timeout: 15000 });
    // Automático desfaz
    await page.locator('#diast-btn-auto').click();
    await expect(page.locator('#diast-manual-panel')).toBeHidden();
  });

  test('itens 1+4 — rascunho sobrevive a F5; seção fechada não perde medida', async ({ page }) => {
    test.setTimeout(180000); // autosave real de 60s faz parte do roteiro
    await abrirLaudo(page, NOME_A);
    // medida dentro de seção que será FECHADA (Sistólica: FE Simpson #b19)
    const secSist = page.locator('#sec-sist, [id^="sec-"]', { hasText: /Sistólica/i }).first();
    // garante aberta, digita, fecha
    const b19 = page.locator('#b19');
    if (!(await b19.isVisible())) await secSist.locator('.section-btn, button').first().click();
    await setMedida(page, 'b19', '58');
    await secSist.locator('.section-btn, button').first().click(); // fecha
    // frase manual no editor
    const ed = editor(page);
    await ed.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Frase de teste do rascunho S5.');
    // espera o autosave de 60s gravar no servidor
    await page.waitForTimeout(70000);
    await page.reload();
    await expect(page.locator('#b9')).toBeEnabled({ timeout: 20000 });
    await page.waitForTimeout(2500); // restauração
    await expect(editor(page)).toContainText('Frase de teste do rascunho S5.', { timeout: 15000 });
    await expect(page.locator('#b19')).toHaveValue('58');
    // 1ª regeneração pós-restauração NÃO duplica nem apaga (emenda T2)
    await setMedida(page, 'b8', '46');
    await expect(editor(page)).toContainText('Frase de teste do rascunho S5.');
  });

  test('item 8 — alerta PSAP aparece e some', async ({ page }) => {
    await abrirLaudo(page, NOME_A);
    // Caminho com params OFF (legado pinta): o nó LEGADO #alerta-psap avisa.
    // O caminho com params ON é o item 8-ON abaixo (gate da virada F5a fechado
    // — o item foi ramificado pela flag como a revisão F3-T2 I1 pediu).
    // Gatilho real (alertaIT): Vel. IT (#b23) preenchida SEM PSAP (#b37)
    await setMedida(page, 'b23', '2.8');
    await expect(page.locator('#alerta-psap')).toBeVisible({ timeout: 10000 });
    await setMedida(page, 'b37', '36');
    await expect(page.locator('#alerta-psap')).toBeHidden({ timeout: 10000 });
  });

  test('item 8-ON — alerta PSAP estruturado com params senna93 (F5a)', async ({ page }) => {
    // Mesmo gatilho, metade dos números LIGADA: quem avisa é a lista
    // estruturada do motor (#alertas-motor, F3-T2); o nó legado #alerta-psap
    // SAI da árvore quando a lista chega (SidebarLaudo, guard !alertasMotor).
    await page.addInitScript(() => localStorage.setItem('leo:params-engine', 'senna93'));
    await abrirLaudo(page, NOME_A);
    await setMedida(page, 'b23', '2.8');
    await expect(page.locator('#alertas-motor'))
      .toContainText('Velocidade IT preenchida sem PSAP', { timeout: 15000 });
    // enquanto a lista tem itens, o nó legado nem existe (não duplica aviso)
    await expect(page.locator('#alerta-psap')).toHaveCount(0);
    await setMedida(page, 'b37', '36');
    // PSAP preenchida → lista esvazia e o CONTAINER sai do DOM (render
    // condicional do SidebarLaudo). not.toContainText falharia com
    // "element(s) not found" — a asserção certa é o container sumir.
    await expect(page.locator('#alertas-motor')).toHaveCount(0, { timeout: 15000 });
  });

  test('item 9 — troca rápida de exame não vaza texto nem identidade', async ({ page }) => {
    await abrirLaudo(page, NOME_A);
    const urlA = page.url();
    await expect(editor(page)).toContainText('Frase de teste do rascunho S5.', { timeout: 20000 });
    // digita algo novo em A e troca IMEDIATAMENTE pra B (sem esperar debounce)
    await setMedida(page, 'b10', '33');
    await entrar(page, '/agenda');
    const rowB = page.getByRole('row', { name: new RegExp(NOME_B) });
    await rowB.getByRole('button', { name: /Laudar|Continuar/ }).click();
    await page.waitForURL(/\/laudo\//, { timeout: 20000 });
    expect(page.url()).not.toBe(urlA);
    await expect(page.locator('#b9')).toBeEnabled({ timeout: 20000 });
    await page.waitForTimeout(2500);
    // B não pode ter o texto nem o nome de A
    await expect(editor(page)).not.toContainText('Frase de teste do rascunho S5.');
    await expect(page.locator('#nome')).not.toHaveValue(NOME_A);
    await expect(page.locator('#b19')).not.toHaveValue('58');
  });

  test('itens 5+7 — emite B: travas valem, correção adm não toca o corpo; cancela no fim', async ({ page }) => {
    await abrirLaudo(page, NOME_B);
    await page.locator('#sexo').selectOption({ index: 1 });
    await setMedida(page, 'b9', '48');
    await expect(editor(page)).toContainText(/Ventrículo|limites/i, { timeout: 15000 });
    const corpoAntes = await editor(page).innerText();

    // EMITIR (PopupEmitir → Emitir Laudo). PDF pode falhar localmente
    // (Puppeteer) — a trava do doc é o que testamos.
    await page.getByRole('button', { name: /Salvar \/ Emitir/ }).click();
    await page.getByRole('button', { name: /Emitir Laudo/ }).click();
    await page.waitForTimeout(8000);

    // Travas do emitido (T6/T4): medida disabled, botões da diastólica inertes
    await expect(page.locator('#b9')).toBeDisabled({ timeout: 20000 });
    await page.locator('#diast-btn-manual').click({ force: true });
    await expect(page.locator('#diast-manual-panel')).toBeHidden();
    // editor não editável
    const editable = await editor(page).getAttribute('contenteditable');
    expect(editable).toBe('false');
    // admin livres (T5/T6)
    await expect(page.locator('#convenio')).toBeEnabled();
    await expect(page.locator('#solicitante')).toBeEnabled();

    // Correção administrativa sem custo (T5) — muda convênio, corpo intacto
    await page.locator('#convenio').fill('UNIMED E2E');
    await page.getByRole('button', { name: /Salvar correção/ }).click();
    await page.waitForTimeout(5000);
    const corpoDepois = await editor(page).innerText();
    expect(corpoDepois).toBe(corpoAntes);
    // continua emitido (autosave não pode des-emitir — fix da tríade)
    await expect(page.locator('#b9')).toBeDisabled();
  });

  test('item 6 — carótidas abre no editor livre DENTRO da moldura A4', async ({ page }) => {
    const NOME_C = `E2E S5C ${RUN}`;
    try {
      await cadastrarPaciente(page, NOME_C, 'doppler_carotidas');
      const row = page.getByRole('row', { name: new RegExp(NOME_C) });
      await row.getByRole('button', { name: /Laudar|Continuar/ }).click();
      await page.waitForURL(/\/laudo-texto\//, { timeout: 20000 });
      // Modelo do catálogo no editor + moldura A4 (T10): caixa de
      // identificação com o nome do paciente e rodapé da clínica na MESMA folha.
      await expect(page.locator('h2', { hasText: 'DOPPLER DE CARÓTIDAS E VERTEBRAIS' }))
        .toBeVisible({ timeout: 15000 });
      await expect(page.getByText(NOME_C).first()).toBeVisible();
      await page.getByRole('button', { name: 'Voltar para a agenda' }).click();
      await page.waitForURL(/\/agenda/);
    } finally {
      await limparDaFila(page, NOME_C);
    }
  });

  test('cleanup — cancela o emitido (devolve consumo) e tira A da fila', async ({ page }) => {
    // cancelar B pelo Histórico/fila (ação Cancelar em emitido)
    await entrar(page, '/agenda');
    const rowB = page.getByRole('row', { name: new RegExp(NOME_B) });
    if (await rowB.count() > 0) {
      const cancelar = rowB.getByRole('button', { name: /Cancelar/ });
      if (await cancelar.count() > 0) {
        await cancelar.click();
        await page.waitForTimeout(4000);
      }
    }
    await limparDaFila(page, NOME_A);
  });
});
