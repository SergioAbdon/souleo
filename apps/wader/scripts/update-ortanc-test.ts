/**
 * Atualiza workspace `wader-dev` com config ortanc fictícia, pra demonstrar
 * a leitura do Firestore funcionando.
 *
 * Uso: npx tsx scripts/update-ortanc-test.ts
 */
import { loadConfig } from '../src/config/load';
import { initFirebase, getDb, FieldValue } from '../src/adapters/firebase';

async function main() {
  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  await db.collection('workspaces').doc('wader-dev').update({
    ortancAtivo: true,
    ortancUrl: 'http://localhost:8042',
    ortancUser: 'wader-test',
    ortancPass: 'wader-test-pass-2026',
    atualizadoEm: FieldValue.serverTimestamp(),
  });

  console.log('✓ Workspace wader-dev atualizado com ortanc fictício de teste');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
