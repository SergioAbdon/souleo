// Autorizacao da /api/corrigir-laudo: so dono/medico do local corrigem convenio.
// A rota chama resolverPapel(db, wsId, uid) e recusa recepcao/forasteiro.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel, podeCorrigir } from '../../src/lib/exame-admin.ts';
import { readFile } from 'node:fs/promises';
import { substituirCamposAdministrativos, emissaoMudou } from '../../src/lib/correcao-admin.ts';
import { sanitizarNomeArq, pathPdf } from '../../src/lib/pdf-path.ts';

let db;
const CONTA = 'contaC', WS = 'wsC';
const DONO = 'uidDonoC', MED = 'uidMedC', RITA = 'uidRitaC';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: DONO });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

describe('autorizacao corrigir-laudo (via resolverPapel)', () => {
  test('dono corrige', async () => assert.equal(await resolverPapel(db, WS, DONO), 'dono'));
  test('medico corrige', async () => assert.equal(await resolverPapel(db, WS, MED), 'medico'));
  test('recepcao resolve papel (S5-T5: passou a poder corrigir, sem credito)', async () => {
    const papel = await resolverPapel(db, WS, RITA);
    assert.equal(papel, 'recepcao');   // D4: recepcao corrige convenio/solicitante
  });
  test('forasteiro sem vinculo → null', async () => {
    assert.equal(await resolverPapel(db, WS, 'uidForasteiro'), null);
  });
});

// resolverPapel so resolve o PAPEL; a autoria + status "emitido" e a regra §4,
// decidida na funcao pura podeCorrigir e checada na rota antes do update.
describe('autoria/emitido corrigir-laudo (podeCorrigir)', () => {
  test('dono + emitido → ok (corrige qualquer autor)', () => {
    assert.deepEqual(podeCorrigir('dono', 'emitido', 'outroMed', DONO), { ok: true });
  });
  test('medico autor + emitido → ok', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', MED, MED), { ok: true });
  });
  test('medico sem autor no exame + emitido → ok (assume)', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', undefined, MED), { ok: true });
  });
  test('medico nao-autor + emitido → nao_e_autor', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', 'outroMed', MED), { ok: false, motivo: 'nao_e_autor' });
  });
  test('qualquer papel + status aguardando → nao_emitido', () => {
    assert.deepEqual(podeCorrigir('dono', 'aguardando', DONO, DONO), { ok: false, motivo: 'nao_emitido' });
    assert.deepEqual(podeCorrigir('medico', 'andamento', MED, MED), { ok: false, motivo: 'nao_emitido' });
  });

  // S5-T5 / D4: correcao administrativa (convenio+solicitante) e trabalho de
  // recepcao. Sem credito, sem tocar no corpo clinico.
  test('recepcao + emitido → ok (corrige de qualquer autor, sem credito)', () => {
    assert.deepEqual(podeCorrigir('recepcao', 'emitido', 'outroMed', RITA), { ok: true });
  });
  test('recepcao + nao emitido → nao_emitido', () => {
    assert.deepEqual(podeCorrigir('recepcao', 'rascunho', MED, RITA), { ok: false, motivo: 'nao_emitido' });
  });
  test('sem vinculo (papel null) → sem_permissao mesmo em emitido', () => {
    assert.deepEqual(podeCorrigir(null, 'emitido', MED, 'uidForasteiro'), { ok: false, motivo: 'sem_permissao' });
  });
});

// ══════════════════════════════════════════════════════════════════
// S5-T5: o HTML do laudo emitido vira SNAPSHOT (Storage) e a correcao
// administrativa reescreve SO os 2 campos nele. O cliente nao manda mais
// pdfHtml — logo, ninguem reescreve o corpo clinico assinado.
// ══════════════════════════════════════════════════════════════════
const P1 = '#0B5FA5';

// Replica FIEL do bloco de identificacao dos dois templates de emissao
// (gerarPdfHtml em /laudo/[id]/page.tsx e gerarPdfHtmlTexto em pdf-texto.ts).
function htmlLaudo(conv, solic) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>ECOTT JOSILENE</title></head><body>
<table class="pl">
<thead><tr><td>
  <div style="border:1px solid ${P1};border-radius:3px;padding:3px 6px;margin-bottom:2mm;">
    <div style="display:flex;gap:8px;margin-bottom:2px;">
      <div style="flex:2"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">NOME</span><span style="display:block;font-size:8.5pt;font-weight:500;">JOSILENE DA SILVA</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">IDADE</span><span style="display:block;font-size:8.5pt;font-weight:500;">62 anos</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">DATA DE NASCIMENTO</span><span style="display:block;font-size:8.5pt;font-weight:500;">12/03/1964</span></div>
    </div>
    <div style="display:flex;gap:8px;">
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">CONVÊNIO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${conv}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">MÉDICO SOLICITANTE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${solic}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">DATA DO EXAME</span><span style="display:block;font-size:8.5pt;font-weight:500;">20/08/2026</span></div>
    </div>
  </div>
</td></tr></thead>
<tbody><tr><td class="body-cell">
  <div>MEDIDAS E PARÂMETROS</div><table><tr><td>FEVE</td><td>68</td><td>%</td></tr></table>
  <div>CONCLUSÃO</div><ul><li>Função sistólica do VE preservada. CONVÊNIO do paciente não muda nada aqui.</li></ul>
</td></tr></tbody>
</table></body></html>`;
}

describe('substituirCamposAdministrativos (snapshot congelado)', () => {
  test('troca os 2 campos e mais NADA (byte-a-byte)', () => {
    const antes = htmlLaudo('UNIMED', 'Dr. Edwaldo Rocha');
    const depois = substituirCamposAdministrativos(antes, { convenio: 'BRADESCO SAÚDE', solicitante: 'Dra. Marina Lima' });
    assert.equal(depois, htmlLaudo('BRADESCO SAÚDE', 'Dra. Marina Lima'));
    // o corpo clinico segue intocado
    assert.ok(depois.includes('Função sistólica do VE preservada.'));
    assert.ok(depois.includes('JOSILENE DA SILVA'));
    assert.ok(depois.includes('68'));
    assert.equal(depois.length - antes.length,
      ('BRADESCO SAÚDE'.length - 'UNIMED'.length) + ('Dra. Marina Lima'.length - 'Dr. Edwaldo Rocha'.length));
  });

  test('valor com caractere especial de regex entra literal ($&, $1, parenteses)', () => {
    const depois = substituirCamposAdministrativos(htmlLaudo('UNIMED', 'Dr. A'),
      { convenio: 'AMIL $1 (SP) [A] $&', solicitante: 'Dr. B' });
    // `$1`/`$&` entram literais (o `&` ainda passa pelo escape de HTML)
    assert.equal(depois, htmlLaudo('AMIL $1 (SP) [A] $&amp;', 'Dr. B'));
  });

  test('vazio → travessao e travessao → valor (ida e volta)', () => {
    const vazio = substituirCamposAdministrativos(htmlLaudo('UNIMED', 'Dr. A'), { convenio: '', solicitante: '   ' });
    assert.equal(vazio, htmlLaudo('—', '—'));
    const cheio = substituirCamposAdministrativos(vazio, { convenio: 'PARTICULAR', solicitante: 'Dr. C' });
    assert.equal(cheio, htmlLaudo('PARTICULAR', 'Dr. C'));
  });

  test('valor com HTML e escapado (nao injeta tag no laudo assinado)', () => {
    const depois = substituirCamposAdministrativos(htmlLaudo('UNIMED', 'Dr. A'),
      { convenio: '<script>alert(1)</script>', solicitante: 'Silva & Cia "SA"' });
    assert.ok(!depois.includes('<script>'));
    assert.equal(depois, htmlLaudo('&lt;script&gt;alert(1)&lt;/script&gt;', 'Silva &amp; Cia &quot;SA&quot;'));
  });

  test('snapshot sem o bloco ancora → null (falha segura, nao corrompe)', () => {
    assert.equal(substituirCamposAdministrativos('<html><body>laudo antigo sem identificacao</body></html>',
      { convenio: 'UNIMED', solicitante: 'Dr. A' }), null);
    // so um dos dois blocos presente tambem nao serve
    const soConv = htmlLaudo('UNIMED', 'Dr. A').replace('MÉDICO SOLICITANTE', 'OUTRA COISA');
    assert.equal(substituirCamposAdministrativos(soConv, { convenio: 'X', solicitante: 'Y' }), null);
  });
});

// S5-T5 fix / I1: o alvo da regravacao sai da metadata do snapshot (escrita
// pelo servidor na emissao), NUNCA do doc do exame — `firestore.rules` deixa o
// medico-autor reescrever o proprio exame emitido, e uma `pdfUrl` forjada
// apontando pro PDF de outro paciente faria a correcao destruir o laudo alheio.
describe('alvo do PDF corrigido nao vem do doc do exame (I1)', () => {
  test('a rota nao le pdfUrl do doc; usa o nomeArq do snapshot', async () => {
    const bruto = await readFile(new URL('../../src/app/api/corrigir-laudo/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');   // comentarios citam o vetor de proposito
    assert.ok(!/antes\.pdfUrl/.test(src), 'route.ts voltou a usar antes.pdfUrl como alvo do PDF');
    assert.ok(!/nomeArqDoPdfUrl/.test(src), 'alvo do PDF nao pode ser derivado no request');
    assert.ok(/gerarESalvarPdf\([^)]*snapshot\.nomeArq/.test(src), 'alvo do PDF tem que vir do snapshot');
  });
  test('snapshot sem metadata → string vazia vira o default laudo_{id}, nunca o doc', () => {
    // lerSnapshotHtml normaliza metadata ausente para ''; salvarPdfBuffer cai
    // no proprio default. Aqui garantimos que '' e um alvo valido e inofensivo.
    assert.equal(sanitizarNomeArq('', 'exame123'), 'laudo_exame123');
  });
});

describe('emissaoMudou (CAS de reemissao durante a correcao — I4)', () => {
  const ts = (ms) => ({ toMillis: () => ms });
  test('mesmo selo de emissao → nao mudou', () => {
    assert.equal(emissaoMudou(ts(1755000000000), ts(1755000000000)), false);
  });
  test('reemitiu durante o Puppeteer → mudou', () => {
    assert.equal(emissaoMudou(ts(1755000000000), ts(1755000009999)), true);
  });
  test('sumiu / apareceu o selo → mudou', () => {
    assert.equal(emissaoMudou(ts(1755000000000), undefined), true);
    assert.equal(emissaoMudou(undefined, ts(1755000000000)), true);
  });
  test('sem selo dos dois lados → nao mudou (emitido legado)', () => {
    assert.equal(emissaoMudou(undefined, null), false);
  });
});

// Ruflo-4 (fix-wave triade pre-merge): `acao:'regerar'` reusa a rota do
// "Regerar PDF" (Worklist) mas NAO e correcao administrativa — sem
// dependencia de injecao (a rota nao e importavel fim-a-fim, mesma limitacao
// documentada acima em "alvo do PDF corrigido nao vem do doc do exame"),
// trava o CONTRATO por leitura de fonte.
describe('/api/corrigir-laudo — modo regerar (Ruflo-4)', () => {
  test('regerando usa antes.convenio/antes.solicitante, nunca o corpo, e pula o update dos 2 campos', async () => {
    const bruto = await readFile(new URL('../../src/app/api/corrigir-laudo/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');
    assert.match(src, /const regerando = acao === 'regerar';/);
    assert.match(src, /const convFinal = regerando \? String\(antes\.convenio \?\? ''\) : conv;/);
    assert.match(src, /const solicFinal = regerando \? String\(antes\.solicitante \?\? ''\) : solic;/);
    assert.match(src, /if \(!regerando\) \{\s*await ref\.update\(\{\s*convenio: convFinal,\s*solicitante: solicFinal,/);
    assert.match(src, /tipo: regerando \? 'regeracao_pdf' : 'correcao_admin',/);
  });

  test('podeSalvar do Puppeteer exige status emitido (espelho do guard E8) — nao so o selo de emissao', async () => {
    const bruto = await readFile(new URL('../../src/app/api/corrigir-laudo/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');
    assert.match(src, /atualData\?\.status === 'emitido' && !emissaoMudou\(antes\.emitidoEm, atualData\?\.emitidoEm\)/,
      'cancelar/transferir preservam emitidoEm — sem o status a correcao republica PDF de laudo cancelado');
  });

  test('sucesso publica pelo caminho atomico (round 2) e baixa pdfPendente so se a key nao mudou', async () => {
    const bruto = await readFile(new URL('../../src/app/api/corrigir-laudo/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');
    // Round 2 (Codex, check-then-write/C4): a rota nao escreve mais
    // `{ pdfUrl, pdfErro: delete }` direto no doc — quem publica e
    // publicarCorrecaoSeAindaEmitido (emitir-admin.ts), atomica com a baixa
    // condicional de pdfPendente (so se a gaveta nao mudou de key desde o guard).
    assert.match(src, /const keyNoGuard = \(await refEmissaoPrivada\(dbAdmin, wsId, exameId\)\.get\(\)\)\.data\(\)\?\.emissaoKey \?\? null;/,
      'key da gaveta capturada JUNTO do guard, antes do Puppeteer rodar');
    assert.match(src, /await publicarCorrecaoSeAindaEmitido\(dbAdmin, \{\s*wsId, exameId, pdfUrl: pdfCandidato, emitidoEmAntes: antes\.emitidoEm, keyNoGuard,\s*\}\)/,
      'sucesso da regeracao tem que publicar pelo mesmo caminho atomico que /api/emitir (round 2)');
    assert.ok(!/\.update\(\{ pdfUrl,/.test(src),
      'a rota nao pode mais escrever pdfUrl direto no doc — quem publica e publicarCorrecaoSeAindaEmitido');
    // Round 7 (Ponytail item 4): pin de import exato e a copia duplicada do
    // pin !/marcarPdfPronto/ saíram — a copia canonica mora em
    // emitir-pdf-erro.test.mjs.
  });

  test('catch do Puppeteer marca pdfErro pela transacao condicional (round 3, item 3)', async () => {
    const bruto = await readFile(new URL('../../src/app/api/corrigir-laudo/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');
    // Round 2 (Ruflo-3a) marcava incondicionalmente; round 2-item-3 passou a
    // reler o doc e checar status antes; round 3 (Codex Important) fechou a
    // ultima janela: o check-then-update fora de transacao ainda deixava o
    // catch da tentativa A carimbar pdfErro no exame que B tinha acabado de
    // reemitir com sucesso. Agora e uma UNICA transacao condicional, com
    // keyNoGuard (se a gaveta mudou de key, uma emissao nova esta em curso).
    assert.match(src, /await marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey: keyNoGuard \}\)\s*\n\s*\.catch\(\(e2\) => console\.error\('marcar pdfErro \(nao-critico\):', e2\)\)/,
      'catch do Puppeteer tem que marcar pdfErro pela transacao condicional, nao por check-then-update solto');
    // Round 7 (Ponytail item 4): pin negativo do formato round-2 (check-then-
    // update manual) saiu — arqueologia sem valor de regressao a esta altura.
  });

  test('perdeu a corrida no publicar: pdfErro fica reemitido_durante_correcao + orfao APAGADO (round 3, item 2)', async () => {
    const bruto = await readFile(new URL('../../src/app/api/corrigir-laudo/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/console\.warn\(`corrigir-laudo: PDF gerado mas perdeu a corrida/.test(src),
      'perda de corrida tem que ficar rastreavel pelo log');
    assert.match(src, /await apagarPdfObjeto\(wsId, exameId, snapshot\.nomeArq\);/,
      'round 3 (Codex Critical, item 2): a correcao apaga o objeto que ELA MESMA regravou ao perder a corrida');
    // Round 7 (Ponytail item 4): pin de import exato saiu.
  });
});

// S5-T14 (I3/ARQ-I3): o formato do path mora em `pdf-path.ts` — a correcao
// nao faz mais parse de URL pra redescobrir o alvo (o nome vai na metadata do
// snapshot, gravado pelo servidor na emissao com esta mesma funcao).
describe('pdf-path — alvo estavel entre emissao e correcao', () => {
  test('sanitizacao e idempotente: emitir e corrigir apontam pro MESMO objeto', () => {
    const bruto = 'ECOTT JOSILENE DA SILVA';
    const umaVez = sanitizarNomeArq(bruto, 'ex1');
    assert.equal(umaVez, 'ECOTT_JOSILENE_DA_SILVA');
    assert.equal(sanitizarNomeArq(umaVez, 'ex1'), umaVez);
    assert.equal(pathPdf('wsC', 'ex1', umaVez), pathPdf('wsC', 'ex1', sanitizarNomeArq(umaVez, 'ex1')));
  });
  test('exames diferentes do mesmo paciente NAO colidem (fix I3)', () => {
    const nome = sanitizarNomeArq('ECOTT JOSILENE DA SILVA', 'marco');
    assert.notEqual(pathPdf('wsC', 'marco', nome), pathPdf('wsC', 'setembro', nome));
  });
});
