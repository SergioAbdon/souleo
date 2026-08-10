// Dev (untracked): confere o cadastro manual de hoje (CPF salvo?).
// Le tudo e filtra em memoria (sem where -> sem depender de indice).
// node check-paciente-hoje.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const ex = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(e => (e.pacienteNome || '').toUpperCase().includes('SERGIO ROBERTO ABDON'))
    .sort((a, b) => String(b.dataExame).localeCompare(String(a.dataExame)));

  if (!ex.length) { console.log('Nenhum exame com esse nome.'); process.exit(0); }

  for (const e of ex.slice(0, 3)) {
    console.log(`=== EXAME ${e.id} ===`);
    console.log(`  pacienteNome   = ${e.pacienteNome}`);
    console.log(`  dataExame      = ${e.dataExame}   origem = ${e.origem}   status = ${e.status}`);
    console.log(`  cpf (no EXAME) = "${e.cpf || ''}"  ${e.cpf ? '<- CPF ESTA SALVO ✓' : '<- VAZIO'}`);
    console.log(`  pacienteId     = ${e.pacienteId || '(sem)'}`);
    if (e.pacienteId) {
      const p = await db.collection('workspaces').doc(wsId).collection('pacientes').doc(e.pacienteId).get();
      const pd = p.exists ? p.data() : {};
      console.log(`  cpf (no PACIENTE)      = "${pd.cpf || ''}"  ${pd.cpf ? '✓' : '<- VAZIO'}`);
      console.log(`  telefone (no PACIENTE) = "${pd.telefone || ''}"  ${pd.telefone ? '✓' : '<- VAZIO'}`);
    }
    console.log('');
  }
  console.log('Conclusao: se "CPF ESTA SALVO" acima -> o cadastro gravou certo;');
  console.log('a edicao SO nao mostra (bug #7). Salvar a edicao em branco e que apagaria.');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
