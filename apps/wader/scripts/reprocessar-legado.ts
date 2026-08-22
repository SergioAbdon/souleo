/**
 * Mutirão de reprocesso dos exames com `medidasDicom` no schema ANTIGO
 * (D1-b, Task 9): schema antigo é `Record<string, number>` — sem unidade
 * nem grupo, alvo dos achados 1+2 (cm importado como mm, código genérico
 * sobrescrito entre grupos). Em vez de reconverter no lugar (adivinhação),
 * marca `reprocessarDicom: true` — o worker relê o estudo do Orthanc com o
 * parser novo (`dicom-sr-parser.ts`), que grava unidade+grupo corretos.
 *
 * Só marca exames com `dicomOrthancStudyId` presente (senão não há o que
 * reprocessar — o worker já trata esse caso gravando `dicomUltimoErro`).
 *
 * Dry-run por default (só lista). Grava só com --commit.
 *
 * Uso: npx tsx scripts/reprocessar-legado.ts [--commit]
 */

import { loadConfig } from '../src/config/load';
import { initFirebase, getDb, FieldValue } from '../src/adapters/firebase';

/** Schema antigo: valor é `number` cru (sem `{value, unit, meaning, grupo}`). */
function schemaAntigo(medidasDicom: unknown): boolean {
  if (!medidasDicom || typeof medidasDicom !== 'object') return false;
  const valores = Object.values(medidasDicom as Record<string, unknown>);
  return valores.length > 0 && typeof valores[0] === 'number';
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('═══════════════════════════════════════════════');
  console.log(`  Mutirão reprocesso legado — ${commit ? 'GRAVANDO' : 'DRY-RUN'}`);
  console.log('═══════════════════════════════════════════════\n');

  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  const snap = await db.collection('workspaces').doc(config.wsId).collection('exames').get();

  const alvos = snap.docs.filter((d) => {
    const data = d.data();
    return schemaAntigo(data.medidasDicom) && !!data.dicomOrthancStudyId;
  });

  console.log(`Exames no workspace: ${snap.size}`);
  console.log(`Schema antigo + estudo vinculado: ${alvos.length}\n`);

  for (const d of alvos) {
    console.log(`  ▸ ${d.id} (acc=${d.data().acc ?? '?'}, dicomOrthancStudyId=${d.data().dicomOrthancStudyId})`);
  }

  if (!commit) {
    console.log(`\nDry-run — nada gravado. Rode com --commit pra marcar reprocessarDicom:true.`);
    console.log(`  npm run reprocessar-legado -- --commit`);
    process.exit(0);
  }

  for (const d of alvos) {
    await d.ref.update({ reprocessarDicom: true, dicomUltimoErro: FieldValue.delete() });
  }
  console.log(`\n${alvos.length} exame(s) marcado(s) com reprocessarDicom:true.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Erro:', err);
  process.exit(1);
});
