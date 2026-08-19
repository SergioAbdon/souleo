/**
 * Script de setup do ambiente de DEV do Wader.
 *
 * O que faz:
 *   1. Inicializa Firebase Admin com a SA configurada
 *   2. Garante que o workspace `wader-dev` exista com `integracoes/feegow`
 *      (procMap) e `integracoes/orthanc` + `privado/orthanc` válidos —
 *      campos canônicos pós Sub-plano 5 (Task 4/7): NÃO semeia mais
 *      `feegowProcMap`/`ortancUrl`/`ortancUser`/`ortancPass` no documento do
 *      workspace — esses campos são lidos como "não configurado" hoje
 *      (getProcedimentos cai no default, getOrthancConnection devolve null).
 *   3. Limpa exames antigos da coleção GLOBAL `exames/` (schema desalinhado da F2 v1)
 *   4. Reporta estado final
 *
 * Uso: npx tsx scripts/setup-dev.ts
 */

import { loadConfig } from '../src/config/load';
import { initFirebase, getDb, FieldValue } from '../src/adapters/firebase';

const TARGET_WS_ID = 'wader-dev';

const FEEGOW_PROC_MAP_DEFAULT: Record<string, string> = {
  '6': 'eco_tt',
  '67': 'doppler_carotidas',
  '285': 'eco_te',
  '999': 'eco_stress',
};

const ORTHANC_TESTE = {
  url: 'http://localhost:8042',
  user: 'wader-test',
  pass: 'wader-test-pass-2026',
};

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Wader · Setup de ambiente DEV');
  console.log('═══════════════════════════════════════════════\n');

  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  console.log(`✓ Firebase inicializado (projectId: ${config.firebase.projectId})`);
  console.log(`✓ Workspace alvo: ${TARGET_WS_ID}\n`);

  // 1) Workspace de teste + integracoes/feegow + integracoes/orthanc + privado/orthanc
  await garantirWorkspaceDev(db);

  // 2) Limpar exames antigos da coleção global (F2 v1)
  await limparExamesGlobaisAntigos(db);

  // 3) Resumo final
  await reportarEstado(db);

  console.log('\n✅ Setup concluído.\n');
  process.exit(0);
}

async function garantirWorkspaceDev(db: FirebaseFirestore.Firestore) {
  console.log(`▸ Garantindo workspaces/${TARGET_WS_ID}...`);
  const ref = db.collection('workspaces').doc(TARGET_WS_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log(`  ▸ Workspace não existe — criando...`);
    await ref.set({
      id: TARGET_WS_ID,
      nomeClinica: 'Wader Dev (Ambiente de Testes)',
      slogan: 'Ambiente isolado pra desenvolvimento',
      // Espelho que SidebarLaudo.tsx le pra mostrar "Importar DICOM" — NAO e
      // campo legado, e o que salvarIntegracao grava junto com
      // integracoes/orthanc.ativo (ver src/lib/integracoes-admin.ts).
      ortancAtivo: true,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ Workspace criado.`);
  } else {
    console.log(`  ✓ Workspace já existe.`);
  }

  // integracoes/feegow.procMap — fonte UNICA (Task 4/7 item A), sem
  // fallback pro campo antigo workspaces/{id}.feegowProcMap.
  const feegowRef = db.doc(`workspaces/${TARGET_WS_ID}/integracoes/feegow`);
  const feegowSnap = await feegowRef.get();
  const procMapAtual = (feegowSnap.data()?.procMap as Record<string, string> | undefined) ?? {};
  if (Object.keys(procMapAtual).length > 0) {
    console.log(`  ✓ integracoes/feegow.procMap já existe (${Object.keys(procMapAtual).length} entradas).`);
  } else {
    await feegowRef.set({ tipo: 'feegow', procMap: FEEGOW_PROC_MAP_DEFAULT }, { merge: true });
    console.log(`  ✓ integracoes/feegow.procMap semeado (fictício).`);
  }

  // integracoes/orthanc.url/ativo + privado/orthanc.user/pass — mesmos
  // nomes canônicos que workspace-repo.ts (Wader) e a rota /api/orthanc
  // (LEO web) já leem.
  const orthancPubRef = db.doc(`workspaces/${TARGET_WS_ID}/integracoes/orthanc`);
  const orthancPubSnap = await orthancPubRef.get();
  if (orthancPubSnap.exists && orthancPubSnap.data()?.url) {
    console.log(`  ✓ integracoes/orthanc já configurado.`);
  } else {
    await orthancPubRef.set({ tipo: 'orthanc', url: ORTHANC_TESTE.url, ativo: true }, { merge: true });
    await db.doc(`workspaces/${TARGET_WS_ID}/privado/orthanc`).set(
      { user: ORTHANC_TESTE.user, pass: ORTHANC_TESTE.pass }, { merge: true },
    );
    console.log(`  ✓ integracoes/orthanc + privado/orthanc semeados (Orthanc fictício de teste).`);
  }
}

async function limparExamesGlobaisAntigos(db: FirebaseFirestore.Firestore) {
  console.log(`\n▸ Limpando exames antigos da coleção GLOBAL "exames/" (schema F2 v1)...`);
  const snap = await db.collection('exames').where('wsId', '==', TARGET_WS_ID).get();
  if (snap.empty) {
    console.log(`  ✓ Nada a limpar.`);
    return;
  }
  console.log(`  ▸ Removendo ${snap.size} doc(s)...`);
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`  ✓ Removidos.`);
}

async function reportarEstado(db: FirebaseFirestore.Firestore) {
  console.log(`\n▸ Estado final:`);
  const wsSnap = await db.collection('workspaces').doc(TARGET_WS_ID).get();
  const wsData = wsSnap.data() ?? {};
  console.log(`  workspace.nomeClinica = "${wsData.nomeClinica}"`);
  console.log(`  workspace.ortancAtivo (espelho) = ${wsData.ortancAtivo}`);

  const feegowSnap = await db.doc(`workspaces/${TARGET_WS_ID}/integracoes/feegow`).get();
  console.log(`  integracoes/feegow.procMap = ${JSON.stringify(feegowSnap.data()?.procMap ?? {})}`);

  const orthancPubSnap = await db.doc(`workspaces/${TARGET_WS_ID}/integracoes/orthanc`).get();
  console.log(`  integracoes/orthanc = ${JSON.stringify(orthancPubSnap.data() ?? {})}`);

  const examesSnap = await db
    .collection('workspaces')
    .doc(TARGET_WS_ID)
    .collection('exames')
    .get();
  console.log(`  workspaces/${TARGET_WS_ID}/exames: ${examesSnap.size} documentos`);

  const pacientesSnap = await db
    .collection('workspaces')
    .doc(TARGET_WS_ID)
    .collection('pacientes')
    .get();
  console.log(`  workspaces/${TARGET_WS_ID}/pacientes: ${pacientesSnap.size} documentos`);

  const examesGlobalAntigos = await db.collection('exames').where('wsId', '==', TARGET_WS_ID).get();
  console.log(`  exames/ (global, schema antigo): ${examesGlobalAntigos.size} documentos`);
}

main().catch((err) => {
  console.error('\n❌ Erro no setup:', err);
  process.exit(1);
});
