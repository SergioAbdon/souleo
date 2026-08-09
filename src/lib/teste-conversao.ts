// Dev (untracked): valida conversão de unidade nos 2 exames reais.
// npx tsx src/lib/teste-conversao.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizarParaImport } from './dicom-sr-mapping';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();

const EXAMES = [
  { nome: 'CARMEN (NOVO, mm/cm·s — não pode mudar)', id: 'MLEJdxMPuYbzsbYoVbGM' },
  { nome: 'MANOEL (ANTIGO, cm/m·s — deve converter)', id: 'uj1U5egIB7ox8CzbNRV8' },
];

(async () => {
  for (const ex of EXAMES) {
    const d = await db.collection('workspaces').doc('LDRtedkanx3bUvxpdmiL')
      .collection('exames').doc(ex.id).get();
    const r = normalizarParaImport(d.data()?.medidasDicom);
    console.log('\n■ ' + ex.nome + '  (' + r.length + ' campos)');
    r.sort((a, b) => a.campo.localeCompare(b.campo, undefined, { numeric: true }))
     .forEach((x) => console.log(
       '  ' + (x.campo + ' ' + x.nomePt).slice(0, 26).padEnd(28) +
       String(x.valor).padEnd(10) + (x.unit || '-'),
     ));
  }
  process.exit(0);
})().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
