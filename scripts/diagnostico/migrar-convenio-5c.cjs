// Dev (untracked): APLICA migracao #5c. Topo convenio vazio E
// medidas.convenio preenchido -> copia pro topo. Idempotente.
// Guarda marcador _migracaoConvenio (reversivel; medidas.convenio intacto).
// node migrar-convenio-5c.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const vazio = (v) => v == null || String(v).trim() === '';

(async () => {
  const col = db.collection('workspaces').doc(wsId).collection('exames');
  const snap = await col.get();
  const alvo = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => vazio(e.convenio) && e.medidas && !vazio(e.medidas.convenio));

  console.log(`Exames a migrar: ${alvo.length}\n`);
  if (!alvo.length) { console.log('Nada a fazer (idempotente).'); process.exit(0); }

  for (const e of alvo) {
    const valor = String(e.medidas.convenio).trim();
    await col.doc(e.id).update({
      convenio: valor,
      _migracaoConvenio: {
        de: e.convenio == null ? '(ausente)' : String(e.convenio),
        para: valor,
        origem: 'medidas.convenio',
        em: new Date().toISOString(),
        nota: 'migracao #5c 16/05 — fonte unica convenio',
      },
    });
    console.log(`  OK  ${e.pacienteNome.padEnd(34)} convenio: "" -> "${valor}"  (exame ${e.id})`);
  }

  // Verificacao pos-migracao
  const snap2 = await col.get();
  const restante = snap2.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => vazio(e.convenio) && e.medidas && !vazio(e.medidas.convenio));
  console.log(`\nVerificacao: ${alvo.length} migrados. Restantes divergentes: ${restante.length} ${restante.length === 0 ? 'OK ✓' : '!! VERIFICAR'}`);
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
