/**
 * Atualiza workspace `wader-dev` pra apontar pro Orthanc REAL da MedCardio.
 * Use SOMENTE quando estiver na rede da clínica.
 *
 * Uso: npx tsx scripts/apontar-orthanc-medcardio.ts
 */
import { loadConfig } from '../src/config/load';
import { initFirebase, getDb, FieldValue } from '../src/adapters/firebase';

async function main() {
  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  await db.collection('workspaces').doc('wader-dev').update({
    ortancAtivo: true,
    ortancUrl: 'http://192.168.15.27:8042',
    ortancUser: 'leo',
    ortancPass: 'leo2026',
    atualizadoEm: FieldValue.serverTimestamp(),
  });

  console.log('✓ wader-dev apontado pro Orthanc real da MedCardio (192.168.15.27:8042)');
  console.log('  Reinicie o Wader pra invalidar cache (ou use POST /api/orthanc/config/refresh)');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
