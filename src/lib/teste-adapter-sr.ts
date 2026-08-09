// Dev (untracked): roda normalizarParaImport no medidasDicom REAL da
// Carmen e mostra o que auto-preenche. npx tsx src/lib/teste-adapter-sr.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizarParaImport } from './dicom-sr-mapping';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();

const ANOT: Record<string, string> = {
  b7: '~33', b8: '~34', b9: '~50', b10: '~11', b11: '~10', b12: '~30',
  b28: '~40', b19: '~63', b20: '~1,3', b21: '~2,4', b22: '~26,8', b24: '~17',
};

(async () => {
  const d = await db.collection('workspaces').doc('LDRtedkanx3bUvxpdmiL')
    .collection('exames').doc('MLEJdxMPuYbzsbYoVbGM').get();
  const md = d.data()?.medidasDicom;
  const r = normalizarParaImport(md);
  console.log(`Carmen — normalizarParaImport: ${r.length} campos auto-preenchidos\n`);
  console.log('CAMPO  NOME'.padEnd(34) + 'VALOR (arredondado)   unidade   esperado');
  console.log('-'.repeat(80));
  r.sort((a, b) => a.campo.localeCompare(b.campo, undefined, { numeric: true }))
   .forEach((x) => console.log(
     (x.campo + '  ' + x.nomePt).slice(0, 32).padEnd(34) +
     String(x.valor).padEnd(22) + String(x.unit || '-').padEnd(10) + (ANOT[x.campo] || ''),
   ));
  const got = new Set(r.map((x) => x.campo));
  const esperados = ['b7', 'b8', 'b9', 'b10', 'b11', 'b12', 'b28', 'b19', 'b20', 'b21', 'b22', 'b24'];
  const faltam = esperados.filter((c) => !got.has(c));
  console.log('\n12 esperados:', esperados.join(','));
  console.log(faltam.length ? '❌ FALTAM: ' + faltam.join(',') : '✅ TODOS os 12 mapeados');
  process.exit(0);
})().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
