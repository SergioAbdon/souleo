/**
 * Marca um exame como `emitido` pra testar que sync remove o .wl correspondente.
 *
 * Uso: npx tsx scripts/testar-remocao-wl.ts <exameId>
 */
import { loadConfig } from '../src/config/load';
import { initFirebase, getDb, FieldValue } from '../src/adapters/firebase';

const exameId = process.argv[2];
if (!exameId) {
  console.error('Uso: npx tsx scripts/testar-remocao-wl.ts <exameId>');
  process.exit(1);
}

async function main() {
  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  await db
    .collection('workspaces')
    .doc(config.wsId)
    .collection('exames')
    .doc(exameId)
    .update({
      status: 'emitido',
      emitidoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });

  console.log(`✓ Exame ${exameId} marcado como 'emitido' em ${config.wsId}`);
  console.log(`  Agora rode: curl -X POST http://localhost:8043/api/worklist/sync`);
  console.log(`  Esperado: wlsRemovidos = 1`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
