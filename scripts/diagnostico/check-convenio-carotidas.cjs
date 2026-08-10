// Dev (untracked): por que Carotidas vem sem convenio e Eco vem com?
// node check-convenio-carotidas.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const ALVOS = ['SILVANA LIBERATO', 'BENEDITA LIBERATO', 'LETICIA LOIDE PEREIRA'];

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const alvo of ALVOS) {
    const ex = all.filter(e => (e.pacienteNome || '').toUpperCase().includes(alvo));
    console.log(`\n=== ${alvo} — ${ex.length} exame(s) ===`);
    ex.sort((a, b) => String(a.tipoExame).localeCompare(String(b.tipoExame)));
    for (const e of ex) {
      console.log(`  [${e.tipoExame}] data=${e.dataExame} acc=${e.acc || '?'}`);
      console.log(`     convenio="${e.convenio || ''}"  convenioId=${e.convenioId ?? '(ausente)'}`);
      console.log(`     procedimentoId=${e.procedimentoId ?? '(ausente)'}  feegowAppointId=${e.feegowAppointId ?? '(ausente)'}  profissionalId=${e.profissionalId ?? '(ausente)'}`);
      console.log(`     origem=${e.origem || '?'}  status=${e.status}`);
    }
  }

  // Resumo: convenio por tipoExame em todo o workspace (origem FEEGOW)
  console.log(`\n=== RESUMO: convenio vazio x tipoExame (origem FEEGOW) ===`);
  const porTipo = {};
  for (const e of all) {
    if (e.origem !== 'FEEGOW') continue;
    const t = e.tipoExame || '?';
    porTipo[t] = porTipo[t] || { total: 0, semConv: 0, comConvId: 0 };
    porTipo[t].total++;
    if (!e.convenio) porTipo[t].semConv++;
    if (e.convenioId != null && e.convenioId !== '') porTipo[t].comConvId++;
  }
  for (const [t, s] of Object.entries(porTipo)) {
    console.log(`  ${t.padEnd(20)} total=${s.total}  sem_convenio=${s.semConv}  com_convenioId=${s.comConvId}`);
  }
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
