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
// Lado da SAÍDA (invariante 5, tríade final ARQ-C2): o motor é lido SÓ como
// texto — `public/motor/**` é intocável, este teste nunca o edita.
const motorSrc = fs.readFileSync(path.join(root, 'public', 'motor', 'motorv8mp4.js'), 'utf8');
const molduraSrc = fs.readFileSync(path.join(root, 'src', 'components', 'laudo', 'MolduraA4.tsx'), 'utf8');
const sheetSrc = fs.readFileSync(path.join(root, 'src', 'components', 'laudo', 'SheetA4.tsx'), 'utf8');
const mergeSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'laudo-merge.ts'), 'utf8');
// F3-T5 (A VIRADA): o SEGUNDO escritor dos mesmos nós. Com `senna93Params()`
// ON quem pinta #out-*/#params-tbody é este arquivo, não o motor legado —
// mutuamente exclusivos pela flag (ADR do contrato, item 4).
const paramsRenderSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'params-render.ts'), 'utf8');

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
// Todos são de IDENTIFICAÇÃO e têm dono único no TOPO do exame
// (`coletarIdentificacao` → pacienteNome/pacienteDtnasc/dataExame/convenio/
// solicitante/sexo), lido por Worklist/Extrato/PDF. `convenio` saiu de
// `coletarMedidas` em 16/05; os outros cinco na tríade final da S5 (I5): a
// cópia velha dentro de `medidas` entrava ANTES da identificação canônica e
// sem guarda de campo vazio, então repovoava o campo com o valor antigo e a
// próxima gravação/reemissão desfazia, em silêncio, a correção
// administrativa da recepção (T5). O adapter continua lendo os seis do DOM
// (é de lá que o Senna90 monta a identificação) — só a PERSISTÊNCIA saiu.
const ADAPTER_SEM_PERSISTENCIA = {
  convenio: 'canônico só no topo do exame (Worklist/Extrato) desde 16/05.',
  nome: 'canônico no topo (pacienteNome) — fora de medidas desde a tríade final S5 (I5).',
  dtnasc: 'idem nome (pacienteDtnasc).',
  dtexame: 'idem nome (dataExame).',
  solicitante: 'idem nome — é o campo que a correção administrativa da T5 corrige.',
  sexo: 'idem nome. Continua sendo campo do MOTOR (nº24, muda os cortes) e por ' +
    'isso limparCampos o zera normalmente; o que saiu foi só a cópia em medidas.',
};

// (3) campos de coletarMedidas que limparCampos NÃO zera. Vazia desde a
// tríade final da S5: os 4 campos de identificação que moravam aqui saíram
// de `coletarMedidas` (ver ADAPTER_SEM_PERSISTENCIA acima), então não há
// mais o que isentar — todo campo que `coletarMedidas` persiste hoje é
// clínico e é zerado no "Limpar" comum. Fica pronta pro próximo caso.
const IDENTIFICACAO_NAO_ZERADA_SEMPRE = {};

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
    // Contagens reais hoje (pós tríade final, que tirou os 5 campos de
    // identificação de `campos`): jsxIds=96, adapterIds=67, campos=61,
    // camposNum=38, camposSel=24 (ajustar o piso — nunca o alvo — se
    // encolherem de verdade).
    assert.ok(jsxIds.size >= 80, `idsJsx() extraiu só ${jsxIds.size} ids (esperado >= 80, hoje real: 96) — regex de extração quebrou?`);
    assert.ok(adapterIds.size >= 50, `idsAdapter() extraiu só ${adapterIds.size} ids (esperado >= 50, hoje real: 67) — regex de extração quebrou?`);
    assert.ok(camposColetar.length >= 50, `campos (coletarMedidas) extraiu só ${camposColetar.length} ids (esperado >= 50, hoje real: 61) — regex de extração quebrou?`);
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

// ══════════════════════════════════════════════════════════════════
// (5) CONTRATO DE SAÍDA — motor ESCREVE → tela RENDERIZA → PDF RASPA
// (item 4 do ADR; tríade final ARQ-C2). Até aqui o contrato travado era só o
// da ENTRADA (JSX → coletarMedidas → adapter). A identificação impressa no
// PDF ASSINADO (nome, idade, nascimento, convênio, solicitante, data) é
// produto do MOTOR LEGADO: ele escreve nos `#out-*`, e `gerarPdfHtml()` lê de
// volta por `textContent`. A S5-T10 MOVEU essas âncoras (SheetA4 → MolduraA4)
// e nenhum teste piscou. Se a Seção 6 trocar `renderIdentificacao` do motor
// por render React, o PDF sai com "— / — / —" sem erro nenhum — este teste é
// o alarme.
// ══════════════════════════════════════════════════════════════════
describe('Contrato de SAÍDA (ADR item 4) — os #out-* dos DOIS motores chegam ao PDF', () => {
  /** ids que o motor legado escreve: getElementById('out-x').textContent= */
  const escritosPeloMotor = new Set(
    [...motorSrc.matchAll(/getElementById\('(out-[\w-]+)'\)\.textContent/g)].map(m => m[1]),
  );
  /** F3-T5: ids que o Senna93 escreve (helper `txt(id, valor)` de params-render). */
  const escritosPeloSenna93 = new Set(
    [...paramsRenderSrc.matchAll(/txt\('(out-[\w-]+)'/g)].map(m => m[1]),
  );
  /** ids que a page raspa pra montar o PDF assinado (e o Word, desde a T5). */
  const raspadosPeloPdf = new Set(
    [...pageSrc.matchAll(/getElementById\('(out-[\w-]+)'\)/g)].map(m => m[1]),
  );
  /** ids declarados na folha de tela (SheetA4 passa `id:` pra MolduraA4). */
  const renderizadosNaTela = new Set(
    [...sheetSrc.matchAll(/id: '(out-[\w-]+)'/g)].map(m => m[1]),
  );

  test('(5.0) piso de sanidade — as 4 extrações precisam achar os 6 campos de identificação', () => {
    assert.equal(escritosPeloMotor.size, 6, `motor escreve ${escritosPeloMotor.size} #out-* (esperado 6) — regex quebrou ou o motor mudou`);
    assert.equal(escritosPeloSenna93.size, 6, `params-render.ts escreve ${escritosPeloSenna93.size} #out-* (esperado 6) — com a flag ON, o que faltar sai "—" no PDF assinado`);
    assert.equal(raspadosPeloPdf.size, 6, `page.tsx raspa ${raspadosPeloPdf.size} #out-* (esperado 6)`);
    assert.equal(renderizadosNaTela.size, 6, `SheetA4 declara ${renderizadosNaTela.size} #out-* (esperado 6)`);
  });

  test('(5.0b) os dois escritores escrevem EXATAMENTE o mesmo conjunto', () => {
    assert.deepEqual(
      [...escritosPeloSenna93].sort(), [...escritosPeloMotor].sort(),
      'a virada do cabo (F3-T5) troca quem pinta, não O QUE é pintado — ' +
      'a flag decide entre dois escritores que precisam cobrir os mesmos nós',
    );
  });

  test('(5.1) tudo que os DOIS motores ESCREVEM existe como nó na tela (SheetA4 → MolduraA4)', () => {
    const semNo = [...escritosPeloMotor, ...escritosPeloSenna93].filter(id => !renderizadosNaTela.has(id));
    assert.deepEqual(semNo, [], `escrita em id(s) que a tela não renderiza: ${semNo.join(', ')}`);
    // MolduraA4 é quem materializa o `id` — sem isto os ids do SheetA4 viram decoração.
    assert.match(molduraSrc, /id=\{c\.id\}/, 'MolduraA4 precisa aplicar o `id` do campo no <span>');
  });

  test('(5.2) tudo que o PDF RASPA é escrito por ALGUM dos dois (senão imprime "—" em silêncio)', () => {
    const orfaos = [...raspadosPeloPdf].filter(id => !escritosPeloMotor.has(id) && !escritosPeloSenna93.has(id));
    assert.deepEqual(orfaos, [], `a page raspa id(s) que ninguém escreve: ${orfaos.join(', ')}`);
  });

  test('(5.3) #params-tbody: os dois escrevem, a tela tem o nó, a page raspa', () => {
    assert.match(motorSrc, /getElementById\('params-tbody'\)\.innerHTML/);
    assert.match(paramsRenderSrc, /getElementById\('params-tbody'\)/);
    assert.match(paramsRenderSrc, /tb\.innerHTML = /);
    assert.match(sheetSrc, /id="params-tbody"/);
    assert.match(pageSrc, /#params-tbody tr/);
  });

  test('(5.4) os dois escritores são mutuamente exclusivos pela flag (nunca pintam juntos)', () => {
    // Do lado legado: TODA chamada de `calcFn()` dentro do efeito do motor
    // está atrás de `if (!paramsOn)`. Do lado novo: a pintura do Senna93 só
    // acontece sob `paramsOn`. Se um dos dois vazar do guard, a tabela é
    // pintada duas vezes por rodada e o último a escrever vence — divergência
    // clínica silenciosa entre a tela e o PDF.
    const efeito = pageSrc.split('function motorInicializar()')[1]?.split('// nº21 (S5-T7)')[0] || '';
    assert.ok(efeito, 'não achei o corpo de motorInicializar — a extração precisa ser refeita');
    assert.match(efeito, /const paramsOn = senna93Params\(\);/, '`paramsOn` precisa ser lido UMA vez por montagem do efeito');
    // m3 (revisão F3-T5): a contagem casava o literal `try { calcFn(); }` —
    // um `calcFn()` escrito de outro jeito (sem try, dentro de um `if` de uma
    // linha, encadeado) passava batido E sem guarda, e a tabela era pintada
    // duas vezes por rodada. Agora conta TODA chamada de `calcFn()`, com os
    // comentários removidos antes (o corpo do efeito cita `calcFn()` em prosa
    // 6 vezes — contar o texto cru daria 9 e o número não significaria nada).
    const codigo = efeito.replace(/\/\/.*$/gm, '');
    const chamadasCalc = (codigo.match(/calcFn\(\)/g) || []).length;
    const guardas = (codigo.match(/if \(!paramsOn\) \{/g) || []).length;
    assert.equal(chamadasCalc, 3, `o efeito tem ${chamadasCalc} chamadas de calcFn() (esperado 3: sc, branch sintético, init)`);
    assert.equal(guardas, 3, `${guardas} guardas \`if (!paramsOn)\` para 3 chamadas de calcFn() — alguma pintura legada escapou da flag`);
    for (const m of efeito.matchAll(/pintarTabelaSenna93\(/g)) {
      const antes = efeito.slice(Math.max(0, m.index - 400), m.index);
      assert.match(antes, /if \(paramsOn\b/, 'toda pintura do Senna93 precisa estar sob `if (paramsOn…)`');
    }
  });

  test('(5.5) `window.calc` — o ponto cego fora do efeito continua coberto', () => {
    // SidebarLaudo chama `window.calc` DIRETO (motorCalc, 3 botões da
    // diastólica): fora do alcance do guard `paramsOn`, e o regex do
    // contrato nunca viu essas chamadas. Com a flag ON, a page reaponta
    // `window.calc` pro `sc()` — senão o motor legado repinta a tabela por
    // cima da do Senna93 e o PDF sai com números do motor errado.
    const efeito = pageSrc.split('function motorInicializar()')[1]?.split('// nº21 (S5-T7)')[0] || '';
    assert.match(sidebarSrc, /function motorCalc\(\) \{ motorCall\('calc'\)/,
      'se `motorCalc` sumiu da SidebarLaudo (T6?), reveja o wrap de `window.calc` na page — pode ter perdido o motivo');
    assert.match(efeito, /__calcOrig/,
      '`calcFn` precisa vir do `calc()` CRU guardado, nunca do wrapper (senão sc() chama a si mesmo)');
    assert.match(efeito, /\.calc = \(\) => \{/,
      'com a flag ON, `window.calc` precisa cair no `sc()`');
  });

  test('(5.6) o wrap de `window.calc` se DESFAZ com a flag OFF (revisão I1)', () => {
    // `window.calc` é global: sobrevive ao remount da page. Sem o `else`,
    // virar o kill-switch e trocar de exame (sem F5) deixava o wrapper velho
    // no ar apontando pro `scRef` novo — que com OFF não pinta nada — e os 3
    // botões da diastólica de `SidebarLaudo` ficavam mudos.
    const efeito = pageSrc.split('function motorInicializar()')[1]?.split('// nº21 (S5-T7)')[0] || '';
    assert.match(efeito.replace(/\/\/.*$/gm, ''), /\} else if \(wCalc\.__calcOrig\) \{\s*wCalc\.calc = wCalc\.__calcOrig;/,
      'o `if (paramsOn)` que instala o wrapper precisa do `else` que restaura o `calc()` cru do `__calcOrig`');
  });

  test('(5.7) emissão com a flag ON exige tabela pintada E FRESCA (revisão I2 + F3-T6)', () => {
    // Com ON a tabela É a ponte: se ela falhou, `#params-tbody` está vazio e
    // `gerarPdfHtml` raspa nada — sairia um laudo ASSINADO sem a tabela de
    // medidas. O guard tem que estar ANTES do `gerarPdfHtml` do handleEmitir.
    //
    // F3-T6 (re-revisão da T5, concern 3): contar `tr` só responde "existe
    // tabela". Uma tabela pintada e DEPOIS invalidada por uma rodada que
    // falhou continua no DOM com os números VELHOS e passava pelo guard —
    // laudo assinado com medidas de antes da última edição. `tabelaFrescaRef`
    // é a segunda metade da pergunta: "a última rodada deu certo?".
    const emitir = pageSrc.split('async function handleEmitir(')[1]?.split('const pdfHtml = gerarPdfHtml(')[0] || '';
    assert.ok(emitir, 'não achei o trecho de handleEmitir até o gerarPdfHtml');
    assert.match(emitir, /senna93Params\(\)\s*\n?\s*&& \(document\.querySelectorAll\('#params-tbody tr'\)\.length === 0 \|\| !tabelaFrescaRef\.current\)/,
      'handleEmitir precisa abortar (antes de montar o pdfHtml) quando a flag está ON e a tabela não carregou OU não está fresca');
  });

  test('(5.9) o frescor da tabela é marcado em TODOS os pontos (F3-T6)', () => {
    // O ref só vale se for atualizado nos 6 pontos: nasce `false`, vira
    // `false` nas 4 falhas (as mesmas do toast de (5.8)) e `true` depois de
    // cada uma das 2 pinturas que completaram. Esquecer um `false` deixa o
    // guard de (5.7) aprovar tabela velha; esquecer um `true` trava emissão
    // com a tabela certa na tela.
    assert.match(pageSrc, /const tabelaFrescaRef = useRef\(false\);/,
      'o ref do frescor precisa nascer `false` (antes da 1a pintura não há tabela pra assinar)');
    const efeito = (pageSrc.split('function motorInicializar()')[1]?.split('// nº21 (S5-T7)')[0] || '')
      .replace(/\/\/.*$/gm, '');
    const stale = (efeito.match(/tabelaFrescaRef\.current = false/g) || []).length;
    const fresco = (efeito.match(/tabelaFrescaRef\.current = true/g) || []).length;
    assert.equal(stale, 4, `${stale} marcações de tabela VELHA (esperado 4 — as mesmas 4 falhas de (5.8))`);
    assert.equal(fresco, 2, `${fresco} marcações de tabela FRESCA (esperado 2 — as duas pinturas: debounce e restaurado)`);
  });

  test('(5.8) falha da ponte com a flag ON não é silenciosa (revisão I2) — os DOIS caminhos de pintura avisam', () => {
    const efeito = (pageSrc.split('function motorInicializar()')[1]?.split('// nº21 (S5-T7)')[0] || '')
      .replace(/\/\/.*$/gm, '');
    assert.match(pageSrc, /const MSG_FALHA_TABELA = '/, 'a mensagem de falha da tabela precisa ter fonte única');
    const avisos = (efeito.match(/toast\(MSG_FALHA_TABELA\)/g) || []).length;
    assert.equal(avisos, 4, `${avisos} avisos de falha da tabela (esperado 4: debounce r===null, debounce catch, restaurado r===null, restaurado catch)`);
  });
});

// ══════════════════════════════════════════════════════════════════
// (6) IDENTIFICAÇÃO tem dono único: o TOPO do exame (tríade final I5)
// ══════════════════════════════════════════════════════════════════
describe('Identificação não mora em `medidas`', () => {
  test('(6.1) nenhum campo de identificação em coletarMedidas', () => {
    const intrusos = ['nome', 'dtnasc', 'dtexame', 'convenio', 'solicitante', 'sexo']
      .filter(id => camposColetar.includes(id));
    assert.deepEqual(intrusos, [], `campo canônico do topo duplicado em medidas: ${intrusos.join(', ')} — a cópia velha desfaz a correção administrativa (T5)`);
  });

  test('(6.2) a restauração IGNORA identificação vinda de medidas de exames antigos', () => {
    assert.match(pageSrc, /const SO_DO_TOPO = new Set\(\['nome', 'dtnasc', 'dtexame', 'convenio', 'solicitante', 'sexo'\]\)/);
    assert.match(pageSrc, /if \(SO_DO_TOPO\.has\(id\)\) return;/);
  });
});

// ══════════════════════════════════════════════════════════════════
// (7) CICLO DE VIDA (ADR item 7) — nenhuma execução tardia da instância
// morta escreve no DOM da instância viva (tríade final C1)
// ══════════════════════════════════════════════════════════════════
describe('Ciclo de vida — órfãos da troca de exame', () => {
  test('(7.1) o timer de 500ms do preencherExame tem cleanup E guard de vivoRef', () => {
    const efeito = pageSrc.split('const exameCarregadoId =')[1]?.split('// Autosave')[0] || '';
    assert.match(efeito, /if \(!vivoRef\.current\) return;/,
      'sem o guard, o callback do paciente A escreve a identificação dele na tela do paciente B');
    assert.match(efeito, /return \(\) => clearTimeout\(/,
      'o timer precisa ser cancelado no unmount (troca de exame)');
  });
});

// ══════════════════════════════════════════════════════════════════
// (8) SENTINELA __WILKINS__ (tríade final ARQ-I1) — os rótulos que o
// page.tsx RENDERIZA são os mesmos que o laudo-merge COLAPSA de volta.
// Renomear um rótulo só de um lado = bloco de Wilkins duplicado e
// desatualizado dentro do laudo assinado.
// ══════════════════════════════════════════════════════════════════
describe('Bloco de Wilkins — render (page) e colapso (merge) usam os MESMOS rótulos', () => {
  test('(8.1) WK_LABELS ⊆ alternância da regex RENDER_WILKINS', () => {
    const bloco = pageSrc.match(/const WK_LABELS[^=]*= \{([^}]+)\}/);
    assert.ok(bloco, 'WK_LABELS não encontrado em page.tsx');
    const labels = [...bloco[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(s => !/^(mob|esp|sub|cal)$/.test(s));
    assert.equal(labels.length, 4, `esperado 4 rótulos de Wilkins, achei ${labels.length}`);
    const regex = mergeSrc.match(/\/\^•\\s\*\(([^)]+)\)/);
    assert.ok(regex, 'RENDER_WILKINS (regex dos bullets) não encontrada em laudo-merge.ts');
    const doMerge = new Set(regex[1].split('|'));
    const faltando = labels.filter(l => !doMerge.has(l));
    assert.deepEqual(faltando, [], `rótulo renderizado que o merge não colapsa: ${faltando.join(', ')} — Wilkins duplicaria no laudo`);
  });

  test('(8.2) WK_DESC tem fonte única: page.tsx importa do senna90 (não duplica a tabela clínica)', () => {
    assert.match(pageSrc, /import \{ WK_DESC \} from '@\/senna90\/achados\/wilkins'/);
    assert.ok(!/const WK_DESC/.test(pageSrc), 'a cópia viva de WK_DESC voltou pra page.tsx');
  });
});

// ══════════════════════════════════════════════════════════════════
// (9) window.refluxoPulmonar — o contrato que o ADR de 22/08 não listou
// (achado do levantamento Senna93, consumidores-e-sombra §A4). A page chamava
// direto uma função definida pelo motor legado. Se o motor sumir sem a page
// parar de chamar (ou vice-versa), quebra sem exceção.
//
// F3-T6: os 3 consumidores MIGRARAM pra `sincronizarCampoPmap()` (mesmo corpo,
// em params-render.ts). A definição no motor ficou órfã e só some na F5 — daí
// (9.1) continuar pinando 1. (9.2) e (9.3) agora travam o outro sentido:
// ninguém pode VOLTAR a chamar o motor pra isso, nem pela porta da frente
// (`window.refluxoPulmonar`) nem pela dos fundos (`motorCall('refluxoPulmonar')`
// na SidebarLaudo, que o regex antigo não enxergava — o ponto cego que fez o
// contrato dizer "2 call-sites" quando eram 3).
// ══════════════════════════════════════════════════════════════════
describe('window.refluxoPulmonar — migrado na F3, definição morre na F5', () => {
  test('(9.1) o motor legado DEFINE refluxoPulmonar exatamente 1 vez (até a F5)', () => {
    const defs = (motorSrc.match(/function refluxoPulmonar\(/g) ?? []).length;
    assert.equal(defs, 1, `definições no motor: ${defs}`);
  });
  test('(9.2) page.tsx NÃO chama mais window.refluxoPulmonar', () => {
    const refs = (pageSrc.match(/\.refluxoPulmonar as \(/g) ?? []).length;
    assert.equal(refs, 0,
      `call-sites na page: ${refs} (esperado 0 desde a F3-T6 — voltou? o campo PSMAP tem dono único)`);
  });
  test('(9.3) os 3 call-sites são a função local — inclusive o ponto cego da SidebarLaudo', () => {
    // Comentários fora: o arquivo cita a chamada antiga em prosa (é o
    // registro de por que ela saiu), e o teste vigia CÓDIGO.
    assert.ok(!/motorCall\('refluxoPulmonar'\)/.test(sidebarSrc.replace(/\/\/.*$/gm, '')),
      "o `onChange` do b40p voltou a chamar o motor por `motorCall('refluxoPulmonar')`");
    assert.match(sidebarSrc, /import \{ sincronizarCampoPmap \} from '@\/lib\/params-render'/,
      'a SidebarLaudo precisa importar a função local (client component, import direto)');
    assert.match(sidebarSrc, /onChange=\{sincronizarCampoPmap\}/,
      'o select b40p precisa revelar o #field-psmap pela função local');
    // Na page: os 2 call-sites (branch sintético do listener delegado +
    // `limparCampos`). Comentários fora da conta — o arquivo cita a função em
    // prosa e o número precisa significar chamada de verdade.
    const chamadas = (pageSrc.replace(/\/\/.*$/gm, '').match(/sincronizarCampoPmap\(\)/g) ?? []).length;
    assert.equal(chamadas, 2,
      `chamadas na page: ${chamadas} (esperado 2 — sinal sintético do #laudo-sidebar e limparCampos)`);
  });
  test('(9.2b) endurecimento M1 da revisão T6: NENHUMA forma de refluxoPulmonar sobrevive no código da page/Sidebar', () => {
    // (9.2)/(9.3) são regex de formas específicas — `(window as any).refluxoPulmonar()`
    // ou `window.refluxoPulmonar?.()` escapariam. Aqui: zero ocorrências da PALAVRA
    // no código (comentários removidos) dos dois arquivos.
    for (const [nome, src] of [['page.tsx', pageSrc], ['SidebarLaudo.tsx', sidebarSrc]]) {
      const semComentario = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(!/refluxoPulmonar/.test(semComentario.replace(/refluxoPulmonar: /g, '')),
        `${nome} voltou a citar refluxoPulmonar em código (a única forma legal é o campo de tipo 'refluxoPulmonar: ')`);
    }
  });
  test('(9.4) prova de orfandade: o motor DEFINE mas NÃO CHAMA refluxoPulmonar (pré-condição da deleção na F5)', () => {
    const semDef = motorSrc.replace(/function refluxoPulmonar\(/, '');
    const chamadasMotor = (semDef.match(/refluxoPulmonar\(/g) ?? []).length;
    assert.equal(chamadasMotor, 0,
      `o motor passou a chamar refluxoPulmonar (${chamadasMotor}×) — a F5 não pode mais deletar às cegas`);
  });
});

// ══════════════════════════════════════════════════════════════════
// (10) REALCE ESCOPADO (achado do teste ao vivo 27/08). Os DOIS motores
// emitem `class="alert"` no <td> — só que o do legado sai DESLOCADO 3 linhas
// (bug antigo que só ficou visível quando a T3 criou o CSS). O CSS agora só
// pega a pintura assinada: `params-render.ts` põe `data-engine="senna93"` no
// tbody, o seletor exige o atributo. É um PAR — quebrar um lado sozinho volta
// a acender o realce errado (ou apaga o certo), e nenhum teste de DOM veria.
// ══════════════════════════════════════════════════════════════════
describe('Realce do td.alert — atributo (params-render) e seletor (page) andam juntos', () => {
  test('(10.1) só params-render.ts assina o tbody com data-engine="senna93"', () => {
    assert.match(paramsRenderSrc, /dataset\.engine = 'senna93'/,
      'a pintura do Senna93 precisa assinar o #params-tbody — sem a assinatura o realce some');
    // O legado é intocável e não pode ganhar a assinatura por acidente.
    assert.ok(!/data-engine/.test(motorSrc), 'o motor legado passou a emitir data-engine');
  });
  test('(10.2) o CSS do realce exige o atributo', () => {
    assert.match(pageSrc, /#params-tbody\[data-engine="senna93"\] td\.alert\{/,
      'o seletor do realce precisa ser escopado — sem escopo, o alert deslocado do legado acende');
    assert.ok(!/#params-tbody td\.alert\{/.test(pageSrc),
      'voltou a existir um seletor NÃO escopado de td.alert — o bug do legado fica visível de novo');
  });
});
