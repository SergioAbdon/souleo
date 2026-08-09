// Dev: lista exames recentes/de hoje p/ achar a paciente-teste e ver
// em que estágio do pipeline está (worklist → imagens → SR → laudo).
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const HOJE = '2026-05-16';

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // candidatos: dataExame hoje OU criado/atualizado recente
  const recentes = todos.filter((e) => {
    const dt = String(e.dataExame || '');
    const cr = e.criadoEm && e.criadoEm.toDate ? e.criadoEm.toDate().toISOString().slice(0, 10) : '';
    return dt === HOJE || cr === HOJE || dt.includes('2026-05-1');
  });
  console.log(`Total exames no ws: ${todos.length} · candidatos recentes: ${recentes.length}\n`);
  console.log('docId'.padEnd(22) + 'Paciente'.padEnd(26) + 'Status'.padEnd(13) + 'dataExame'.padEnd(12) + '#med imgDICOM acc/feegow');
  console.log('-'.repeat(110));
  recentes
    .sort((a, b) => String(b.dataExame || '').localeCompare(String(a.dataExame || '')))
    .slice(0, 25)
    .forEach((e) => {
      const nMed = e.medidas ? Object.keys(e.medidas).length : 0;
      const img = e.imagensDicom ? (Array.isArray(e.imagensDicom) ? e.imagensDicom.length + ' img' : 'sim') : (e.imagens ? 'imagens?' : '—');
      const acc = e.acc || e.accessionNumber || e.feegowAppointId || e.feegowId || '—';
      console.log(
        String(e.id).slice(0, 20).padEnd(22) +
        String(e.pacienteNome || e.nome || '?').slice(0, 24).padEnd(26) +
        String(e.status || '?').padEnd(13) +
        String(e.dataExame || '?').padEnd(12) +
        String(nMed).padEnd(5) + String(img).padEnd(10) + String(acc)
      );
    });
  console.log('\n(procure a paciente-teste pelo nome; me diga o docId que eu acompanho o pipeline nela)');
  process.exit(0);
})().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
