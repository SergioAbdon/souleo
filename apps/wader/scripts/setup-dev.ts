/**
 * Script de setup do ambiente de DEV do Wader.
 *
 * O que faz:
 *   1. Inicializa Firebase Admin com a SA configurada
 *   2. Garante que o workspace `wader-dev` exista com `feegowProcMap` válido
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

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Wader · Setup de ambiente DEV');
  console.log('═══════════════════════════════════════════════\n');

  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  console.log(`✓ Firebase inicializado (projectId: ${config.firebase.projectId})`);
  console.log(`✓ Workspace alvo: ${TARGET_WS_ID}\n`);

  // 1) Workspace de teste
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

  if (snap.exists) {
    const data = snap.data() ?? {};
    const procMap = data.feegowProcMap ?? {};
    const tem = Object.keys(procMap).length > 0;
    if (tem) {
      console.log(`  ✓ Workspace existe e já tem feegowProcMap (${Object.keys(procMap).length} entradas).`);
      return;
    }
    console.log(`  ⚠ Workspace existe mas sem feegowProcMap, atualizando...`);
    await ref.update({
      feegowProcMap: FEEGOW_PROC_MAP_DEFAULT,
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ feegowProcMap adicionado.`);
    return;
  }

  console.log(`  ▸ Workspace não existe — criando com defaults...`);
  await ref.set({
    id: TARGET_WS_ID,
    nomeClinica: 'Wader Dev (Ambiente de Testes)',
    slogan: 'Ambiente isolado pra desenvolvimento',
    feegowProcMap: FEEGOW_PROC_MAP_DEFAULT,
    feegowAtivo: false,
    // Orthanc de teste (fictício — só pra exercitar leitura do Firestore)
    ortancAtivo: true,
    ortancUrl: 'http://localhost:8042',
    ortancUser: 'wader-test',
    ortancPass: 'wader-test-pass-2026',
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  console.log(`  ✓ Workspace criado: nomeClinica="Wader Dev" (com Orthanc fictício de teste)`);
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
  const procMap = wsData.feegowProcMap ?? {};
  console.log(`  workspace.nomeClinica = "${wsData.nomeClinica}"`);
  console.log(`  workspace.feegowProcMap = ${JSON.stringify(procMap)}`);

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
