/**
 * Verifica se algum workspace já tem credenciais Orthanc salvas no Firestore
 * (configuradas via LocalModal do LEO web).
 *
 * Uso: npx tsx scripts/checar-orthanc-config.ts
 */

import { loadConfig } from '../src/config/load';
import { initFirebase, getDb } from '../src/adapters/firebase';

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Procurando config Orthanc nos workspaces');
  console.log('═══════════════════════════════════════════════\n');

  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  const snap = await db.collection('workspaces').get();

  if (snap.empty) {
    console.log('Nenhum workspace encontrado.');
    process.exit(0);
  }

  console.log(`Total de workspaces: ${snap.size}\n`);

  let achei = 0;
  snap.forEach((doc) => {
    const data = doc.data();
    const tem = data.ortancUrl || data.ortancUser || data.ortancPass;
    if (!tem) return;
    achei++;
    console.log(`▸ workspace: ${doc.id}`);
    console.log(`  nomeClinica:  ${data.nomeClinica ?? '(sem nome)'}`);
    console.log(`  ortancAtivo:  ${data.ortancAtivo ?? false}`);
    console.log(`  ortancUrl:    ${data.ortancUrl ?? '(vazio)'}`);
    console.log(`  ortancUser:   ${data.ortancUser ?? '(vazio)'}`);
    console.log(`  ortancPass:   ${data.ortancPass ? '***' + String(data.ortancPass).slice(-3) + ' (mascarado)' : '(vazio)'}`);
    console.log('');
  });

  if (achei === 0) {
    console.log('⚠️  Nenhum workspace tem credenciais Orthanc configuradas no Firestore.');
    console.log('   Provavelmente nunca foi salvo via LocalModal do LEO web.\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Erro:', err);
  process.exit(1);
});
