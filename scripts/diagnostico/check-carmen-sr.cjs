// Dev: inspeciona metadados DICOM da Carmen p/ saber se um SR
// (Structured Report) chegou junto, ou só as imagens US.
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const docId = 'MLEJdxMPuYbzsbYoVbGM';

(async () => {
  const d = await db.collection('workspaces').doc(wsId).collection('exames').doc(docId).get();
  const e = d.data();
  console.log('dicomOrthancStudyId :', e.dicomOrthancStudyId);
  console.log('dicomStudyUid       :', e.dicomStudyUid);
  console.log('\n--- dicomMeta ---');
  console.log(JSON.stringify(e.dicomMeta, null, 1));
  console.log('\n--- imagensDicomDetalhes ---');
  const det = e.imagensDicomDetalhes;
  if (Array.isArray(det)) {
    det.forEach((x, i) => console.log(`[${i}] ` + JSON.stringify(x).slice(0, 300)));
  } else {
    console.log(JSON.stringify(det, null, 1));
  }
  console.log('\n--- imagensDicom (urls) ---');
  (e.imagensDicom || []).forEach((u, i) => console.log(`[${i}] ` + String(u).slice(0, 140)));
  process.exit(0);
})().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
