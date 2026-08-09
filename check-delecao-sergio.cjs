// Dev (untracked): confere se a delecao do exame de teste ocorreu certo.
// node check-delecao-sergio.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const EXAME_APAGADO = 'QQrozy4tFs4ru9LMzvPs';
const PACIENTE = 'CsNppAqf8vHxw0DEOg9J';

(async () => {
  // 1) O exame que ele apagou ainda existe?
  const ex = await db.collection('workspaces').doc(wsId).collection('exames').doc(EXAME_APAGADO).get();
  console.log(`1) Exame ${EXAME_APAGADO}:`);
  console.log(`   existe? ${ex.exists ? 'SIM ❌ (NAO foi apagado)' : 'NAO ✓ (apagado corretamente)'}\n`);

  // 2) Sobrou algum exame de hoje (17/05) do SERGIO?
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const sergio = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(e => (e.pacienteNome || '').toUpperCase().includes('SERGIO ROBERTO ABDON'))
    .sort((a, b) => String(b.dataExame).localeCompare(String(a.dataExame)));
  const hoje = sergio.filter(e => e.dataExame === '2026-05-17');
  console.log(`2) Exames do SERGIO em 17/05 (worklist de hoje): ${hoje.length} ${hoje.length === 0 ? '✓ (limpo)' : '❌'}`);
  hoje.forEach(e => console.log(`   - ${e.id} status=${e.status}`));
  console.log(`   (todos os exames do SERGIO no historico: ${sergio.length})`);
  sergio.forEach(e => console.log(`     ${e.dataExame} ${String(e.status).padEnd(13)} origem=${e.origem} id=${e.id}`));

  // 3) A FICHA do paciente foi mexida? (removerDaFila NAO apaga paciente)
  const p = await db.collection('workspaces').doc(wsId).collection('pacientes').doc(PACIENTE).get();
  console.log(`\n3) Ficha do paciente ${PACIENTE}:`);
  if (p.exists) {
    const pd = p.data();
    console.log(`   existe? SIM (esperado — apagar do worklist NAO apaga o paciente)`);
    console.log(`   nome="${pd.nome}"  cpf="${pd.cpf || ''}"  telefone="${pd.telefone || ''}"`);
  } else {
    console.log(`   existe? NAO (a ficha tambem sumiu)`);
  }
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
