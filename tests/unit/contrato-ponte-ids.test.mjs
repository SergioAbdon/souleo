// Contrato da Ponte tela↔motor (D7, revisão S5, docs/planos/2026-08-22-revisao-
// secao5-tela-laudo.md § "O CONTRATO DA PONTE"). Item 1 do parecer: cinco
// listas de ids mantidas à mão (JSX, coletarMedidas, adapter, motor,
// handleLimpar/limparCampos) já divergiram de verdade (wilkins-toggle,
// diast-manual-sel, b24_diast, b28/b29/b34t). Este teste lê os ARQUIVOS FONTE
// (sem importar componentes React — não há DOM/jsdom no test runner) e trava
// que os conjuntos batem, com toda exceção justificada aqui, não escondida.
//
// Estilo de extração (fs.readFileSync + regex sobre o texto) e leitura via
// path.resolve(import.meta.dirname, ...) copiados de
// tests/unit/laudo-trava-emitido.test.mjs (T6) — mesmo par de arquivos-fonte,
// mesma técnica; não há helper compartilhado porque cada teste extrai uma
// coisa diferente do texto (CSS/livres lá, arrays de ids aqui) e a extração
// em si é curta o bastante pra duplicar ser mais barato que abstrair.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const pageSrc = fs.readFileSync(path.join(root, 'src', 'app', 'laudo', '[id]', 'page.tsx'), 'utf8');
const sidebarSrc = fs.readFileSync(path.join(root, 'src', 'components', 'laudo', 'SidebarLaudo.tsx'), 'utf8');
const adapterSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'motor-ts-adapter.ts'), 'utf8');

// ── Extração ──────────────────────────────────────────────────────────────

/** ids literais `id="..."` no JSX (inclui os passados a wrappers como
 *  <VSel id="b34" />, <Sec id="sec-cam" /> — a literal está no call-site). */
function idsJsx() {
  return new Set([...sidebarSrc.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]));
}

/** array de string literals de uma declaração `const NOME = [...]` em page.tsx.
 *  Não-guloso até o primeiro `];` — seguro aqui pq os 3 arrays só têm strings
 *  entre aspas simples, sem colchete aninhado dentro. */
function extrairArray(nome) {
  const re = new RegExp(`const ${nome} = \\[([\\s\\S]*?)\\];`);
  const m = pageSrc.match(re);
  assert.ok(m, `\`const ${nome} = [...]\` não encontrado em page.tsx`);
  return [...m[1].matchAll(/'([\w-]+)'/g)].map(x => x[1]);
}

const camposColetar = extrairArray('campos'); // dentro de coletarMedidas()
const camposNum = extrairArray('camposNum'); // dentro de limparCampos()
const camposSel = extrairArray('camposSel'); // dentro de limparCampos()
const camposLimpar = new Set([...camposNum, ...camposSel]);

/** ids lidos pelo adapter: read(Str|Num|Wk|SelecaoManual|Checked)('id') —
 *  NÃO é o `read(Num|Str|Checked)` literal do brief: o arquivo real também
 *  tem readWk (Wilkins 0-4) e readSelecaoManual (índice manual da
 *  diastólica), então a lista de sufixos foi ajustada pra bater com as
 *  funções que motor-ts-adapter.ts de fato exporta/usa hoje. Só casa
 *  chamadas com string literal — as chamadas internas com variável
 *  (readWk → readNum(id)) ficam de fora, que é o que queremos (não são ids). */
function idsAdapter() {
  return new Set(
    [...adapterSrc.matchAll(/read(?:Str|Num|Wk|SelecaoManual|Checked)\('([\w-]+)'\)/g)].map(m => m[1]),
  );
}

// ── Allowlists (cada exceção com justificativa — nada some sem explicação) ──

// (2) ids que o adapter lê mas coletarMedidas NÃO persiste.
const ADAPTER_SEM_PERSISTENCIA = {
  convenio: 'canônico só no topo do exame (Worklist/Extrato) desde 16/05 — ' +
    'removido de coletarMedidas de propósito (comentário page.tsx:900-902); ' +
    'o adapter lê para montar identificacao, mas load usa o fallback do topo.',
};

// (3) campos de coletarMedidas que limparCampos NÃO zera — são de
// IDENTIFICAÇÃO, zerados condicionalmente (só em troca de exame, dentro do
// próprio limparCampos) e não em toda chamada de "Limpar" comum.
const IDENTIFICACAO_NAO_ZERADA_SEMPRE = {
  nome: 'identificação — zerado só em trocaDeExame (limparCampos:1735), não em Limpar comum',
  dtnasc: 'idem nome',
  dtexame: 'idem nome (recebe dataLocalHoje() no Limpar comum em vez de vazio)',
  solicitante: 'idem nome',
};
// nota: 'sexo' NÃO entra aqui — decisão nº24 (doc revisão S5): sexo é campo do
// MOTOR (muda cortes clínicos), não de identificação; por isso limparCampos
// zera sexo normalmente (camposSel) e a exceção não se aplica a ele.

// (4) ids extintos: sem elemento na JSX, mas ainda referenciados em page.tsx.
// b24_diast foi unificado com b24 (comentário SidebarLaudo.tsx:422). A S5-T12
// REMOVEU as 3 referências vivas nas listas/sync handler (coletarMedidas,
// camposNum, o listener b24↔b24_diast) — nenhuma sobra dentro de
// `campos`/`camposNum`/`camposSel`, então a allowlist fica vazia (não
// apagada: é o lugar certo pra registrar o PRÓXIMO id extinto, se algum
// surgir). A única referência que sobrou no arquivo é INTENCIONAL — ver
// B24_DIAST_TOTAL_REFS_ATUAL abaixo — e por isso não entra aqui: (4)/(4b) só
// enxergam os 3 arrays rastreados, e o mapeamento legado vive fora deles.
const IDS_EXTINTOS = [];

// Contagem TOTAL (revisão S5-T11 fix, Finding 2; zerada e repactuada na
// S5-T12): (4)/(4b) só olham os ids DENTRO de `campos`/`camposNum`/
// `camposSel` — não pegam um mapeamento solto no meio do código. Depois da
// limpeza da T12 (listas + sync handler removidos), a ÚNICA referência que
// sobra no arquivo é DELIBERADA: o mapeamento legado em `preencherExame`
// (chave antiga da Diastólica → 'b24', pra exames salvos ANTES da
// unificação com b24 continuarem carregando o valor — comentário ao lado
// do `setVal` cita este teste). Pino em 1 de propósito: se cair pra 0, o
// mapeamento legado foi removido (ok se for deliberado — depreciar suporte a
// exames pré-unificação — apagar este teste e IDS_EXTINTOS já não muda,
// pois já está vazio); se subir, alguma referência nova apareceu no arquivo
// — investigar antes de só atualizar o número.
const B24_DIAST_TOTAL_REFS_ATUAL = 1;

function contarRefsB24Diast() {
  return (pageSrc.match(/b24_diast/g) || []).length;
}

// ── Asserções ────────────────────────────────────────────────────────────

describe('Contrato da Ponte tela↔motor (D7) — os 3 arquivos concordam nos ids', () => {
  const jsxIds = idsJsx();
  const adapterIds = idsAdapter();

  test('(0) piso de sanidade das extrações — nenhuma pode esvaziar em silêncio (senão (1)-(4) passam vazias, sem checar nada)', () => {
    // Pisos abaixo da contagem real de hoje mas bem acima de zero — cortam
    // qualquer regressão da regex de extração (aspas trocadas, id virar
    // template literal, etc.) que zeraria o Set/array sem quebrar a sintaxe.
    // Contagens reais hoje (pós S5-T12, que tirou 'b24_diast' de campos e
    // camposNum): jsxIds=96, adapterIds=67, campos=66, camposNum=38,
    // camposSel=24 (ajustar o piso — nunca o alvo — se encolherem de verdade).
    assert.ok(jsxIds.size >= 80, `idsJsx() extraiu só ${jsxIds.size} ids (esperado >= 80, hoje real: 96) — regex de extração quebrou?`);
    assert.ok(adapterIds.size >= 50, `idsAdapter() extraiu só ${adapterIds.size} ids (esperado >= 50, hoje real: 67) — regex de extração quebrou?`);
    assert.ok(camposColetar.length >= 50, `campos (coletarMedidas) extraiu só ${camposColetar.length} ids (esperado >= 50, hoje real: 66) — regex de extração quebrou?`);
    assert.ok(camposNum.length >= 25, `camposNum extraiu só ${camposNum.length} ids (esperado >= 25, hoje real: 38) — regex de extração quebrou?`);
    assert.ok(camposSel.length >= 15, `camposSel extraiu só ${camposSel.length} ids (esperado >= 15, hoje real: 24) — regex de extração quebrou?`);
  });

  test('(1) todo id que o adapter lê EXISTE no JSX de SidebarLaudo.tsx', () => {
    const faltando = [...adapterIds].filter(id => !jsxIds.has(id));
    assert.deepEqual(faltando, [], `adapter lê id(s) sem elemento na JSX: ${faltando.join(', ')}`);
  });

  test('(2) todo id que o adapter lê está em coletarMedidas (persistência), exceto allowlist justificada', () => {
    const colSet = new Set(camposColetar);
    const excecoes = Object.keys(ADAPTER_SEM_PERSISTENCIA);
    const faltando = [...adapterIds].filter(id => !colSet.has(id) && !excecoes.includes(id));
    assert.deepEqual(faltando, [], `adapter lê id(s) fora de coletarMedidas e fora da allowlist: ${faltando.join(', ')}`);
  });

  test('(2b) allowlist de "sem persistência" não fica pra trás: cada entrada precisa continuar sendo lida pelo adapter e ausente de coletarMedidas', () => {
    const colSet = new Set(camposColetar);
    for (const id of Object.keys(ADAPTER_SEM_PERSISTENCIA)) {
      assert.ok(adapterIds.has(id), `allowlist cita '${id}' mas o adapter não lê mais esse id — remover da allowlist`);
      assert.ok(!colSet.has(id), `allowlist cita '${id}' como não-persistido, mas já está em coletarMedidas — remover da allowlist`);
    }
  });

  test('(3) limparCampos ⊇ (coletarMedidas ∩ campos clínicos) — exceto identificação (zerada só em troca de exame)', () => {
    const excecoes = Object.keys(IDENTIFICACAO_NAO_ZERADA_SEMPRE);
    const clinicos = camposColetar.filter(id => !excecoes.includes(id));
    const faltando = clinicos.filter(id => !camposLimpar.has(id));
    assert.deepEqual(faltando, [], `campo clínico em coletarMedidas mas ausente de limparCampos (camposNum/camposSel): ${faltando.join(', ')}`);
  });

  test('(3b) allowlist de identificação não fica pra trás: cada entrada precisa continuar em coletarMedidas e ausente de limparCampos', () => {
    const colSet = new Set(camposColetar);
    for (const id of Object.keys(IDENTIFICACAO_NAO_ZERADA_SEMPRE)) {
      assert.ok(colSet.has(id), `allowlist cita '${id}' mas sumiu de coletarMedidas — remover da allowlist`);
      assert.ok(!camposLimpar.has(id), `allowlist cita '${id}' como não-zerado, mas já está em camposNum/camposSel — remover da allowlist`);
    }
  });

  test('(4) nenhuma referência a id extinto fora da allowlist', () => {
    const todasRefs = new Set([...camposColetar, ...camposNum, ...camposSel]);
    const extintasReferenciadas = [...todasRefs].filter(id => !jsxIds.has(id));
    const foraDaAllowlist = extintasReferenciadas.filter(id => !IDS_EXTINTOS.includes(id));
    assert.deepEqual(foraDaAllowlist, [], `id extinto (sem elemento JSX) referenciado sem allowlist: ${foraDaAllowlist.join(', ')}`);
  });

  test('(4b) allowlist de extintos não fica pra trás: cada entrada precisa continuar extinta E ainda referenciada em ALGUM lugar do arquivo (não só nos 3 arrays rastreados)', () => {
    // Hoje IDS_EXTINTOS está vazia (S5-T12 limpou o único id que morava
    // aqui, 'b24_diast' — ver (4c)) — o loop abaixo é um no-op até o
    // próximo id extinto entrar na allowlist. Fica pronto pra reuso.
    for (const id of IDS_EXTINTOS) {
      assert.ok(!jsxIds.has(id), `'${id}' está na allowlist de extintos mas REAPARECEU na JSX — investigar (duplicidade de id?) e remover da allowlist`);
    }
  });

  test('(4c) contagem TOTAL de referências a b24_diast em page.tsx (arquivo inteiro, não só os arrays rastreados) — pina a ÚNICA referência intencional que sobrou (o mapeamento legado em preencherExame)', () => {
    const atual = contarRefsB24Diast();
    assert.equal(
      atual,
      B24_DIAST_TOTAL_REFS_ATUAL,
      `contagem de 'b24_diast' em page.tsx era ${B24_DIAST_TOTAL_REFS_ATUAL}, agora é ${atual} — ` +
      'mudança deliberada (ex.: aposentar o mapeamento legado, contagem cai pra 0) ou ' +
      'referência nova apareceu por engano (contagem sobe)? Se foi deliberado, atualize ' +
      'B24_DIAST_TOTAL_REFS_ATUAL para o novo número; se chegou a 0, o suporte a exames ' +
      "pré-unificação acabou — pode apagar este teste e a linha do mapeamento em preencherExame.",
    );
  });
});
