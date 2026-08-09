// Reverte exames com status='imagens-recebidas' pra 'aguardando'.
// Mantém os campos imagensDicom* intactos (são o sinal pra UI).
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

(async () => {
  const snap = await db
    .collection('workspaces')
    .doc(wsId)
    .collection('exames')
    .where('status', '==', 'imagens-recebidas')
    .get();

  console.log(`Encontrados ${snap.size} exames com status='imagens-recebidas'\n`);

  for (const doc of snap.docs) {
    const d = doc.data();
    const imagens = Array.isArray(d.imagensDicom) ? d.imagensDicom.length : 0;
    console.log(`  ${doc.id} — ${d.pacienteNome} (${imagens} imagens) → status='aguardando'`);
    await doc.ref.update({ status: 'aguardando' });
  }

  console.log(`\nPronto. ${snap.size} exames revertidos.`);
  process.exit(0);
})().catch(err => { console.error('Erro:', err.message); process.exit(1); });
