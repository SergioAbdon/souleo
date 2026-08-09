// Dev (untracked): DRY-RUN da migracao #5c. NAO GRAVA NADA — so lista.
// Regra: topo convenio vazio E medidas.convenio preenchido -> copiaria.
// node check-migracao-convenio-dryrun.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

const vazio = (v) => v == null || String(v).trim() === '';

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const migrar = [];     // topo vazio + medidas.convenio preenchido -> COPIA
  const conflito = [];   // topo preenchido E != medidas.convenio -> NAO TOCA (so avisa)
  const okJaIgual = [];  // topo == medidas.convenio -> nada a fazer
  let semMedidasConv = 0;

  for (const e of all) {
    const topo = e.convenio;
    const med = e.medidas && e.medidas.convenio;
    if (vazio(med)) { semMedidasConv++; continue; }
    if (vazio(topo)) migrar.push(e);
    else if (String(topo).trim() !== String(med).trim()) conflito.push(e);
    else okJaIgual.push(e);
  }

  console.log(`Total exames: ${all.length}`);
  console.log(`  sem medidas.convenio (nada a fazer):      ${semMedidasConv}`);
  console.log(`  topo == medidas.convenio (ja ok):          ${okJaIgual.length}`);
  console.log(`  >>> SERIAM MIGRADOS (topo vazio):          ${migrar.length}`);
  console.log(`  !! CONFLITO (topo != medidas, NAO toca):   ${conflito.length}\n`);

  if (migrar.length) {
    console.log('=== SERIAM CORRIGIDOS (topo vazio -> recebe medidas.convenio) ===');
    migrar.sort((a, b) => String(a.dataExame).localeCompare(String(b.dataExame)));
    migrar.forEach(e => console.log(
      `  ${String(e.dataExame).padEnd(11)} ${String(e.status).padEnd(11)} "${e.medidas.convenio}"  <- ${e.pacienteNome}`
    ));
  }
  if (conflito.length) {
    console.log('\n=== CONFLITO (NAO seriam tocados — so pra voce saber) ===');
    conflito.forEach(e => console.log(
      `  ${e.pacienteNome}: topo="${e.convenio}"  medidas="${e.medidas.convenio}"`
    ));
  }
  console.log('\n(DRY-RUN — nenhuma gravacao feita.)');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
