// Auditoria médico-legal: laudos EMITIDOS com contratilidade segmentar
// (b59/b60/b61) preenchida. O motor antigo mapeava b59=Lateral,
// b60=Inferior, b61=Inferolateral; o AHA (Senna90, decidido correto)
// usa b59=Inferior, b60=Inferolateral, b61=Lateral. Logo, laudos
// emitidos com esses campos NÃO-vazios podem ter nome de parede trocado.
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

const vazio = (v) => !v || v === '' || v === 'NL';

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const emitidos = todos.filter((e) => e.status === 'emitido' || e.emitidoEm);

  const afetados = [];
  for (const e of emitidos) {
    const m = e.medidas || {};
    const b59 = m['b59'], b60 = m['b60'], b61 = m['b61'];
    if (!vazio(b59) || !vazio(b60) || !vazio(b61)) {
      afetados.push({
        id: e.id, paciente: e.pacienteNome, data: e.dataExame,
        b59: b59 || '-', b60: b60 || '-', b61: b61 || '-',
      });
    }
  }

  console.log('======================================================');
  console.log('AUDITORIA MEDICO-LEGAL — paredes b59/b60/b61 em emitidos');
  console.log('======================================================');
  console.log(`Total exames:        ${todos.length}`);
  console.log(`Laudos EMITIDOS:     ${emitidos.length}`);
  console.log(`COM b59/b60/b61 != vazio (potencial parede trocada): ${afetados.length}`);
  console.log('');
  if (afetados.length === 0) {
    console.log('✅ NENHUM laudo emitido tem contratilidade segmentar preenchida.');
    console.log('   Raio de explosao = ZERO. Nada a revisar. Migracao livre.');
  } else {
    console.log('⚠️ Laudos a REVISAR (medico confere nome da parede):');
    console.log('');
    console.log('Paciente'.padEnd(30) + 'Data'.padEnd(12) + 'b59   b60   b61   docId');
    console.log('-'.repeat(85));
    afetados.forEach((a) => {
      console.log(
        String(a.paciente || '?').slice(0, 28).padEnd(30) +
        String(a.data || '?').padEnd(12) +
        String(a.b59).padEnd(6) + String(a.b60).padEnd(6) + String(a.b61).padEnd(6) +
        a.id
      );
    });
    console.log('');
    console.log(`Total: ${afetados.length} laudo(s). Sergio decide revisao caso a caso.`);
  }
  process.exit(0);
})().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
