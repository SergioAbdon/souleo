// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4-T6 · Script CLI do retroativo + relatório
// ══════════════════════════════════════════════════════════════════
// Roda `rodarShadow` (src/lib/shadow/rodar.ts) LOCAL via Admin SDK — sem
// depender de deploy nem do gate de papel da rota (script de operador).
// `rodar.ts` e toda a cadeia pura que ele importa (comparar/allowlist/
// legado-tabela/snapshot-params + senna90/motor) não têm import `@/` em
// tempo de execução (só `import type` de '@/senna90/types' em rodar.ts,
// apagado pelo type-stripping do Node ≥22 — nunca resolvido em runtime),
// então dá pra importar o `.ts` direto no `.mjs`, mesmo padrão dos testes
// (tests/api/shadow-rodar.test.mjs). O que NÃO dá pra importar é
// `src/lib/shadow/deps-admin.ts` (usa `@/lib/auth-admin`, alias que só o
// bundler do Next resolve) — por isso as deps abaixo são um wrapper fino
// próprio sobre `getDb()`, reusando as duas únicas peças reaproveitáveis:
// `getCredential`/`getDb`/`COMMIT`/`modo` de scripts/secao1/lib-admin.mjs.
//
// Uso:
//   npm run shadow:retroativo -- --from AAAA-MM-DD [--to AAAA-MM-DD] [--ws <wsId>] [--commit]
//
// Sem --commit: ENSAIO — roda a comparação inteira, imprime o relatório,
// não grava nada (dep `persistir` vira no-op síncrono devolvendo 'ensaio').
// Sem --ws: roda nos 3 workspaces da fase (hardcoded abaixo).
// ponytail: script de operador da F4 — morre com a sombra na F5b.
// ══════════════════════════════════════════════════════════════════

import { initializeApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getDb, getCredential, COMMIT, modo } from '../secao1/lib-admin.mjs';
import { rodarShadow, exameTemDivergencia } from '../../src/lib/shadow/rodar.ts';
import { normalizar } from '../../src/lib/shadow/comparar.ts';
import { idValido } from '../../src/lib/exame-admin.ts';
// Tríade onda-3 (Ruflo-A2): candidatosSnapshotHtml é pura e ZERO imports
// (pdf-path.ts) — dá pra importar o .ts direto no .mjs, mesmo padrão do
// resto dos imports acima. emitir-admin.ts (dono de refEmissaoPrivada/
// lerGavetaEmissao) NÃO dá pra importar aqui: arrasta billing-admin.ts/
// correcao-admin.ts/ciclo.ts, que não têm a mesma garantia de zero-`@/` que
// a cadeia da sombra tem — por isso o path da gaveta é reescrito 1 linha
// abaixo (lerSnapshot), com comentário apontando o dono real do formato.
import { candidatosSnapshotHtml } from '../../src/lib/pdf-path.ts';

// Os 3 workspaces da fase (spec F4 T5/T6) — sem --ws roda nos 3.
const WORKSPACES_PADRAO = [
  'LDRtedkanx3bUvxpdmiL', // Grupo MedCardio — ~198 exames reais
  'dIJfZvmsVFDrkod9eraJ',
  'wader-dev',
];

const LIMITE_POR_WORKSPACE = 500; // histórico da MedCardio inteiro (a rota mantém 200)
const CHUNK = 400; // limite Firestore = 500 ops/batch (mesmo valor de deps-admin.ts)

// Mesmo fallback de src/lib/auth-admin.ts:23 — precisa de storageBucket pra
// getStorage().bucket() funcionar (getDb() sozinho não configura bucket).
const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app';
if (!getApps().length) {
  initializeApp({ credential: getCredential(), storageBucket: BUCKET });
}
const db = getDb();

const USO = 'Uso: npm run shadow:retroativo -- --from AAAA-MM-DD [--to AAAA-MM-DD] [--ws <wsId>] [--commit]';
const FLAGS_COM_VALOR = ['--ws', '--from', '--to'];
const FLAGS_VALIDAS = [...FLAGS_COM_VALOR, '--commit'];

function sair(msgExtra) {
  if (msgExtra) console.error(msgExtra);
  console.error(USO);
  process.exit(1);
}

// Parsing estrito: revisão T6 — `--ws=x` (silenciosamente ignorado pelo
// antigo argVal/indexOf, caindo nos 3 workspaces padrão) e valor ausente/
// trocado por outra flag (`--ws --commit` virava wsId literal '--commit')
// agora explodem em vez de rodar com escopo errado.
const argvOperador = process.argv.slice(2);
const args = {};
for (let i = 0; i < argvOperador.length; i++) {
  const tok = argvOperador[i];
  if (!tok.startsWith('--')) continue;
  if (!FLAGS_VALIDAS.includes(tok)) sair(`argumento desconhecido: ${tok}`);
  if (tok === '--commit') { args.commit = true; continue; }
  const val = argvOperador[i + 1];
  if (val === undefined || val.startsWith('--')) sair(`valor ausente para ${tok}`);
  args[tok.slice(2)] = val;
  i++; // consome o valor
}

const wsArg = args.ws;
const fromArg = args.from;
const toArg = args.to;

if (!fromArg) sair();

// ── deps reais (Admin SDK) ──

async function listarExames(wsId, from, to) {
  const snap = await db
    .collection('workspaces').doc(wsId).collection('exames')
    .where('status', '==', 'emitido')
    .where('emitidoEm', '>=', Timestamp.fromDate(from))
    .where('emitidoEm', '<=', Timestamp.fromDate(to))
    .orderBy('emitidoEm', 'desc')
    .limit(LIMITE_POR_WORKSPACE)
    .get();
  return snap.docs.map((d) => ({ id: d.id, dados: d.data() }));
}

// Tríade onda-3 (Ruflo-A2, achado): esta função só tentava o path CANÔNICO
// (`laudos-html/{ws}/{exameId}.html`) — igual a pdf-storage.ts ANTES do
// round 5 (ver pdf-path.ts). Exame emitido depois do round 5 (path por
// TENTATIVA, sufixado por emissaoKey) tinha snapshot no path sufixado; este
// script caía no `catch` (arquivo canônico não existe) e devolvia `null` —
// silenciosamente pulava a conferência de snapshot pra exames recentes.
// Fix: resolve como `lerSnapshotHtml` (pdf-storage.ts) — lê a gaveta (path
// do doc é o mesmo que `refEmissaoPrivada`, emitir-admin.ts, monta: não dá
// pra importar essa função aqui sem arrastar billing-admin/correcao-admin/
// ciclo, ver comentário no import acima) e delega a ORDEM de candidatos pra
// `candidatosSnapshotHtml`, a MESMA função pura que pdf-storage.ts usa — sem
// reimplementar a lógica de gaveta→sufixado→canônico na mão.
async function lerSnapshot(wsId, exameId) {
  const gavetaSnap = await db.doc(`workspaces/${wsId}/privado/emissao/exames/${exameId}`).get();
  const candidatos = candidatosSnapshotHtml(wsId, exameId, gavetaSnap.data());
  for (const filePath of candidatos) {
    try {
      const file = getStorage().bucket().file(filePath);
      const [buf] = await file.download();
      return buf.toString('utf8');
    } catch { /* tenta o proximo candidato */ }
  }
  return null; // emitido antigo (pré-25/08) ou PDF anexado: sem snapshot
}

// Mesmo doc shape de src/lib/shadow/deps-admin.ts:24-51 (persistirExecucao)
// — campo a campo idêntico, pra rota/cron/script gravarem no mesmo formato.
async function persistirReal(wsId, exec) {
  const ref = db
    .collection('workspaces').doc(wsId)
    .collection('privado').doc('shadow')
    .collection('execucoes').doc();

  await ref.set({
    rodadaEm: FieldValue.serverTimestamp(),
    origem: exec.origem, uid: exec.uid,
    from: exec.from, to: exec.to,
    resumo: exec.resumo,
  });

  const comDiv = exec.exames.filter(exameTemDivergencia);
  for (let i = 0; i < comDiv.length; i += CHUNK) {
    const batch = db.batch();
    for (const e of comDiv.slice(i, i + CHUNK)) {
      batch.set(ref.collection('exames').doc(e.id), {
        emitidoEm: e.emitidoEm, era: e.era, motorNumeros: e.motorNumeros,
        frases: e.frases, celulas: e.celulas,
        ...(e.snapshotCheck !== undefined ? { snapshotCheck: e.snapshotCheck } : {}),
      });
    }
    await batch.commit();
  }
  return ref.id;
}

// SEM --commit: no-op — prova por construção que o ensaio não grava nada.
const persistir = COMMIT ? persistirReal : async () => 'ensaio';

// ── relatório agrupado por divergência ──

function contarPulados(exames) {
  const c = {};
  for (const e of exames) if (e.pulado) c[e.pulado] = (c[e.pulado] || 0) + 1;
  const entradas = Object.entries(c);
  return entradas.length ? entradas.map(([k, v]) => `${k} ${v}`).join(', ') : 'nenhum';
}

/** Agrupa por chave, contando ocorrências e até 5 exameIds de exemplo. */
function agrupar(entradas, chaveFn) {
  const mapa = new Map();
  for (const { exameId, item } of entradas) {
    const chave = chaveFn(item);
    if (!mapa.has(chave)) mapa.set(chave, { count: 0, item, ids: [] });
    const g = mapa.get(chave);
    g.count++;
    if (g.ids.length < 5) g.ids.push(exameId);
  }
  return [...mapa.values()].sort((a, b) => b.count - a.count);
}

function linhaFrase(g) {
  const { categoria, velho, novo } = g.item;
  return `  ${g.count}× [${categoria}] velho:"${velho}" → novo:"${novo}"  (ex.: ${g.ids.join(', ')})`;
}

function linhaCelula(g) {
  const { linha, col, legado, senna93 } = g.item;
  return `  ${g.count}× [tabela] linha ${linha} col ${col} legado:"${legado}" → senna93:"${senna93}"  (ex.: ${g.ids.join(', ')})`;
}

function imprimirRelatorio(wsId, exec) {
  const r = exec.resumo;
  const exames = exec.exames;

  console.log(`\n── workspace ${wsId} ${'─'.repeat(Math.max(0, 40 - wsId.length))}`);
  console.log(`exames: ${r.totalExames} · comparados: ${r.comparados} · pulados: ${r.pulados} (${contarPulados(exames)})`);
  console.log(`match: ${r.match} · divergem: ${r.diverge}`);
  console.log(`frases  — esperadas: ${r.frases.esperadas} · INESPERADAS: ${r.frases.inesperadas} · era-legado (informativo): ${r.frases.eraLegado}`);
  console.log(`células — esperadas: ${r.celulas.esperadas} · INESPERADAS: ${r.celulas.inesperadas}`);
  console.log(`snapshot — conferidos: ${r.snapshot.conferidos} · batem: ${r.snapshot.batem} · divergem: ${r.snapshot.divergem}`);

  // Só era senna90: frase de exame era-legado já cai no balde informativo
  // acima (comparar com o motor de hoje re-litigaria as divergências de maio).
  const frasesInesperadas = [];
  for (const e of exames) {
    if (e.era === 'legado') continue;
    for (const f of e.frases) if (!f.esperada) frasesInesperadas.push({ exameId: e.id, item: f });
  }
  const celulasInesperadas = [];
  for (const e of exames) {
    for (const c of e.celulas) if (!c.esperada) celulasInesperadas.push({ exameId: e.id, item: c });
  }

  const gruposFrases = agrupar(frasesInesperadas, (f) => `${f.categoria}|${normalizar(f.velho)}→${normalizar(f.novo)}`);
  const gruposCelulas = agrupar(celulasInesperadas, (c) => `${c.linha},${c.col}|${c.legado}|${c.senna93}`);

  console.log('\nINESPERADAS agrupadas (frases era senna90 + células):');
  if (gruposFrases.length === 0 && gruposCelulas.length === 0) {
    console.log('  (nenhuma)');
  } else {
    for (const g of gruposFrases) console.log(linhaFrase(g));
    for (const g of gruposCelulas) console.log(linhaCelula(g));
  }
}

// AAAA-MM-DD local (não UTC) — mesmo formato dos argumentos de entrada.
function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  const wsList = wsArg ? [wsArg] : WORKSPACES_PADRAO;
  for (const wsId of wsList) {
    // Mesma regra da rota (src/lib/exame-admin.ts:idValido) — id entra
    // interpolado no path do Admin SDK, `/` remontaria a coleção.
    if (!idValido(wsId)) sair(`wsId inválido: ${wsId}`);
  }

  const fromDate = new Date(fromArg);
  // fim do dia LOCAL da data pedida — new Date('AAAA-MM-DD') seria meia-noite UTC e
  // cortaria o dia inteiro em UTC-3 (revisao final I1)
  const toDate = toArg ? new Date(`${toArg}T23:59:59.999`) : new Date();
  if (!toArg) toDate.setHours(23, 59, 59, 999);

  console.log(`MODO: ${modo()}`);
  console.log(`período: ${fromArg} .. ${toArg ?? hojeLocal()}`);

  for (const wsId of wsList) {
    const { exec } = await rodarShadow(
      { listarExames, persistir, lerSnapshot },
      { wsId, from: fromDate, to: toDate, origem: 'script', uid: null },
    );
    imprimirRelatorio(wsId, exec);
  }

  if (!COMMIT) {
    // Ecoa o escopo REAL do ensaio (--ws/--to só entram se o operador os deu)
    // — revisão T6: a dica antiga sempre sugeria os 3 workspaces padrão.
    let dica = 'npm run shadow:retroativo --';
    if (wsArg) dica += ` --ws ${wsArg}`;
    dica += ` --from ${fromArg}`;
    if (toArg) dica += ` --to ${toArg}`;
    dica += ' --commit';

    console.log('\nENSAIO. Nada foi gravado.');
    console.log('>>> Pra gravar de valer, rode (o "--" é obrigatório, senão o npm engole a flag):');
    console.log('>>>   ' + dica);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
