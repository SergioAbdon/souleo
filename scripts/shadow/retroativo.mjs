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

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const wsArg = argVal('--ws');
const fromArg = argVal('--from');
const toArg = argVal('--to');

if (!fromArg) {
  console.error('Uso: npm run shadow:retroativo -- --from AAAA-MM-DD [--to AAAA-MM-DD] [--ws <wsId>] [--commit]');
  process.exit(1);
}

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

// `laudos-html/{ws}/{exameId}.html` — mesmo path de pdf-server.ts:78
// (pathSnapshotHtml), reescrito aqui porque a função não é exportada.
async function lerSnapshot(wsId, exameId) {
  try {
    const file = getStorage().bucket().file(`laudos-html/${wsId}/${exameId}.html`);
    const [buf] = await file.download();
    return buf.toString('utf8');
  } catch {
    return null; // emitido antigo (pré-25/08) ou PDF anexado: sem snapshot
  }
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

async function main() {
  const wsList = wsArg ? [wsArg] : WORKSPACES_PADRAO;
  const fromDate = new Date(fromArg);
  const toDate = toArg ? new Date(toArg) : new Date();
  toDate.setHours(23, 59, 59, 999);

  console.log(`MODO: ${modo()}`);
  console.log(`período: ${fromDate.toISOString().slice(0, 10)} .. ${toDate.toISOString().slice(0, 10)}`);

  for (const wsId of wsList) {
    const { exec } = await rodarShadow(
      { listarExames, persistir, lerSnapshot },
      { wsId, from: fromDate, to: toDate, origem: 'script', uid: null },
    );
    imprimirRelatorio(wsId, exec);
  }

  if (!COMMIT) {
    console.log('\nENSAIO. Nada foi gravado.');
    console.log('>>> Pra gravar de valer, rode (o "--" é obrigatório, senão o npm engole a flag):');
    console.log('>>>   npm run shadow:retroativo -- --from ' + fromArg + ' --commit');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
