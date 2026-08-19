/**
 * Verifica se algum workspace tem o Orthanc configurado (campos canonicos
 * pos Sub-plano 5: integracoes/orthanc.url/.ativo + privado/orthanc.user/.pass
 * — nao mais workspaces/{id}.ortancUrl/User/Pass, campo legado ja limpo).
 * Util pra rodar na PC da clinica se o Wader nao conectar.
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
  for (const doc of snap.docs) {
    const data = doc.data();
    const integ = (await db.doc(`workspaces/${doc.id}/integracoes/orthanc`).get()).data();
    if (!integ?.url) continue;
    const priv = (await db.doc(`workspaces/${doc.id}/privado/orthanc`).get()).data();
    achei++;
    console.log(`▸ workspace: ${doc.id}`);
    console.log(`  nomeClinica: ${data.nomeClinica ?? '(sem nome)'}`);
    console.log(`  ativo:       ${integ.ativo ?? false}`);
    console.log(`  url:         ${integ.url}`);
    console.log(`  user:        ${priv?.user ?? '(vazio)'}`);
    console.log(`  senha:       ${priv?.pass ? 'presente' : '(vazio)'}`);
    console.log('');
  }

  if (achei === 0) {
    console.log('⚠️  Nenhum workspace tem Orthanc configurado (integracoes/orthanc.url vazio).');
    console.log('   Provavelmente nunca foi salvo via tela Integracoes do LEO web.\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Erro:', err);
  process.exit(1);
});
