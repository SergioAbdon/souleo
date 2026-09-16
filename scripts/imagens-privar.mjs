// Migra as imagens DICOM já subidas (públicas, ACL `publicRead` — decisão
// 14/05/2026) pra privadas (D5b, achado 20 — 22/08/2026). Objeto novo já
// nasce privado desde apps/wader/src/adapters/storage-uploader.ts; este
// script fecha os objetos ANTIGOS que ainda têm `allUsers` na ACL.
//
// Ensaio por padrão — só lista e conta. `--commit` remove a ACL de verdade.
// A URL canônica (storage.googleapis.com/...) gravada no exame continua a
// mesma — ela virou identificador, quem exibe/imprime troca por signed URL
// (src/lib/imagens-dicom-admin.ts).
import { getDb, COMMIT, modo } from './secao1/lib-admin.mjs';
import { getStorage } from 'firebase-admin/storage';

const BUCKET = 'leo-sistema-laudos.firebasestorage.app';

async function main() {
  getDb(); // so pra garantir o app inicializado com a credencial do .env.local
  const bucket = getStorage().bucket(BUCKET);

  console.log(`MODO: ${modo()}\n`);
  const [files] = await bucket.getFiles({ prefix: 'dicom/' });
  console.log(`${files.length} objeto(s) em dicom/ no bucket ${BUCKET}.\n`);

  let privados = 0, jaPrivados = 0, erros = 0;
  for (const file of files) {
    if (!COMMIT) {
      console.log(`  ${file.name}`);
      continue;
    }
    try {
      await file.acl.delete({ entity: 'allUsers' });
      privados++;
      console.log(`  privado: ${file.name}`);
    } catch (e) {
      // 404 do proprio ACL = objeto ja nao tinha allUsers (idempotente, ok rodar 2x)
      if (e?.code === 404) {
        jaPrivados++;
      } else {
        erros++;
        console.error(`  ERRO ${file.name}:`, e?.message || e);
      }
    }
  }

  console.log(`\n=== ${files.length} objeto(s) encontrados ===`);
  if (!COMMIT) {
    console.log('\nENSAIO. Nada foi alterado.');
    console.log('>>> Pra gravar de valer, rode (o "--" é obrigatório, senão o npm engole a flag):');
    console.log('>>>   npm run imagens:privar -- --commit');
  } else {
    console.log(`${privados} tornados privados, ${jaPrivados} já privados, ${erros} erro(s).`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
