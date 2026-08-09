// Dev (untracked): dump completo exame+paciente do Manoel, caca "PARTICULAR".
// node check-manoel-full.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const exameId = 'uj1U5egIB7ox8CzbNRV8';

function scan(obj, prefix) {
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !v.toDate) { scan(v, path); continue; }
    const s = Array.isArray(v) ? `[array ${v.length}]` : (v && v.toDate ? v.toDate().toISOString() : String(v));
    if (/particular/i.test(s)) console.log(`  >>> ACHOU "PARTICULAR" em: ${path} = "${s}"`);
  }
}

(async () => {
  const ex = await db.collection('workspaces').doc(wsId).collection('exames').doc(exameId).get();
  if (!ex.exists) { console.log('Exame nao existe'); process.exit(1); }
  const d = ex.data();
  console.log('=== EXAME', exameId, '— campos relevantes ===');
  ['pacienteNome','convenio','convenioId','convenioNome','plano','origem','status',
   'dataExame','feegowAppointId','feegowPacienteId','pacienteId','pdfUrl']
   .forEach(c => console.log(`  ${c.padEnd(18)} = ${d[c] === undefined ? '(ausente)' : JSON.stringify(d[c])}`));
  console.log('\n  TODAS as chaves do exame:');
  console.log('   ' + Object.keys(d).sort().join(', '));
  console.log('\n  Busca textual "PARTICULAR" no exame inteiro:');
  scan(d, '');

  if (d.pacienteId) {
    const p = await db.collection('workspaces').doc(wsId).collection('pacientes').doc(d.pacienteId).get();
    if (p.exists) {
      const pd = p.data();
      console.log('\n=== PACIENTE', d.pacienteId, '===');
      ['nome','convenio','convenioNome','plano','feegowPacienteId']
        .forEach(c => console.log(`  ${c.padEnd(18)} = ${pd[c] === undefined ? '(ausente)' : JSON.stringify(pd[c])}`));
      console.log('  TODAS as chaves do paciente:');
      console.log('   ' + Object.keys(pd).sort().join(', '));
      console.log('  Busca textual "PARTICULAR" no paciente:');
      scan(pd, '');
    }
  }
  console.log('\n(Se nenhum ">>> ACHOU" acima: "PARTICULAR" NAO esta no banco — vem do navegador.)');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
