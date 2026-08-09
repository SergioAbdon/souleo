// Dev: dump completo do exame da Carmen-teste p/ ver o que o Wader
// trouxe (status, imagens DICOM, medidas SR e em QUE unidade vieram).
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const docId = 'MLEJdxMPuYbzsbYoVbGM';

(async () => {
  const ref = db.collection('workspaces').doc(wsId).collection('exames').doc(docId);
  const d = await ref.get();
  if (!d.exists) { console.log('DOC NAO EXISTE'); process.exit(1); }
  const e = d.data();
  console.log('=== CARMEN ABDON RODRIGUES (' + docId + ') ===');
  console.log('pacienteNome :', e.pacienteNome || e.nome);
  console.log('status       :', e.status);
  console.log('dataExame    :', e.dataExame);
  console.log('acc          :', e.acc || e.accessionNumber);
  console.log('criadoEm     :', e.criadoEm && e.criadoEm.toDate ? e.criadoEm.toDate().toISOString() : e.criadoEm);
  console.log('atualizadoEm :', e.atualizadoEm && e.atualizadoEm.toDate ? e.atualizadoEm.toDate().toISOString() : e.atualizadoEm);
  console.log('chaves topo  :', Object.keys(e).join(', '));
  const img = e.imagensDicom || e.imagens;
  console.log('\n--- IMAGENS ---');
  if (Array.isArray(img)) {
    console.log('qtd imagens  :', img.length);
    if (img[0]) console.log('exemplo url  :', String(typeof img[0] === 'string' ? img[0] : JSON.stringify(img[0])).slice(0, 120));
  } else { console.log('imagensDicom :', img ? JSON.stringify(img).slice(0, 200) : '— (nenhuma)'); }
  console.log('\n--- MEDIDAS (SR) ---');
  const m = e.medidas || {};
  const ks = Object.keys(m);
  console.log('qtd campos   :', ks.length);
  if (ks.length) {
    ks.sort().forEach((k) => console.log('  ' + k.padEnd(10) + ' = ' + JSON.stringify(m[k])));
  } else {
    console.log('  (medidas VAZIO — SR ainda não chegou ou não mapeou)');
  }
  // campos auxiliares de SR se existirem
  for (const k of ['srImportado', 'dadosSR', 'sr', 'medidasSR', 'dicomSR', 'imagensRecebidasEm']) {
    if (e[k] !== undefined) console.log('\n[' + k + '] =', JSON.stringify(e[k]).slice(0, 300));
  }
  process.exit(0);
})().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
