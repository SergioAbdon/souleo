// Dev (untracked): diagnostico bug cadastro manual -> worklist + convenio.
// node check-bug-cadastro.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const HOJE = '2026-05-16';
const ALVOS = ['MANOEL ROBERTO GEMAQUE', 'SONIA MARIA DE SOUZA', 'ANA CAROLINA RIBEIRO MITRE'];

function fmtTs(t) {
  try { return t && t.toDate ? t.toDate().toISOString().slice(0, 19).replace('T', ' ') : '(sem)'; }
  catch { return '(sem)'; }
}

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total exames no workspace: ${all.length}\n`);

  // 1) Exames com dataExame == HOJE (o que listenWorklist mostraria)
  const deHoje = all.filter(e => e.dataExame === HOJE);
  console.log(`=== dataExame == ${HOJE} (${deHoje.length}) — o que o worklist consulta ===`);
  deHoje.sort((a, b) => (a.horarioChegada || '').localeCompare(b.horarioChegada || ''));
  deHoje.forEach(e => console.log(
    `  ${(e.horarioChegada || '(SEM HORA)').padEnd(10)} st=${String(e.status).padEnd(11)} org=${String(e.origem || '?').padEnd(7)} conv=${String(e.convenio || '(vazio)').padEnd(16)} ${e.pacienteNome}`
  ));

  // 2) Exames CRIADOS hoje (criadoEm) — pega manual de hoje mesmo se dataExame divergir
  console.log(`\n=== criadoEm hoje (${HOJE}) — independe de dataExame ===`);
  const criadosHoje = all.filter(e => fmtTs(e.criadoEm).startsWith(HOJE));
  if (!criadosHoje.length) console.log('  (nenhum exame criado hoje)');
  criadosHoje.sort((a, b) => fmtTs(a.criadoEm).localeCompare(fmtTs(b.criadoEm)));
  criadosHoje.forEach(e => console.log(
    `  criado=${fmtTs(e.criadoEm)} dataExame=${String(e.dataExame).padEnd(12)} hora=${String(e.horarioChegada || '(SEM)').padEnd(8)} st=${String(e.status).padEnd(11)} org=${String(e.origem || '?').padEnd(7)} ${e.pacienteNome}`
  ));

  // 3) Dump completo dos alvos (MANOEL/SONIA/ANA) + paciente vinculado
  for (const alvo of ALVOS) {
    const ex = all.filter(e => (e.pacienteNome || '').toUpperCase().includes(alvo));
    console.log(`\n=== ${alvo} — ${ex.length} exame(s) ===`);
    ex.sort((a, b) => fmtTs(b.criadoEm).localeCompare(fmtTs(a.criadoEm)));
    for (const e of ex) {
      console.log(`  exameId=${e.id}`);
      console.log(`    dataExame=${e.dataExame}  horarioChegada=${e.horarioChegada || '(SEM)'}  criadoEm=${fmtTs(e.criadoEm)}`);
      console.log(`    status=${e.status}  origem=${e.origem || '?'}`);
      console.log(`    convenio(exame)="${e.convenio || ''}"  convenioId=${e.convenioId ?? '(sem)'}`);
      console.log(`    pacienteId=${e.pacienteId || '(sem)'}  feegowAppointId=${e.feegowAppointId ?? '(sem)'}  feegowPacienteId=${e.feegowPacienteId ?? '(sem)'}`);
      if (e.pacienteId) {
        try {
          const p = await db.collection('workspaces').doc(wsId).collection('pacientes').doc(e.pacienteId).get();
          const pd = p.data() || {};
          console.log(`    paciente.convenio="${pd.convenio || ''}"  paciente.feegowPacienteId=${pd.feegowPacienteId ?? '(sem)'}`);
        } catch { console.log('    (paciente nao encontrado)'); }
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
