// Lista chaves do workspace e destaca campos do Orthanc, ocultando blobs grandes.
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });

const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

function summarize(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') {
    if (value.length > 200) return `[string ${value.length} chars]`;
    return value;
  }
  if (typeof value === 'object') {
    if (value._seconds !== undefined) return `Timestamp(${new Date(value._seconds * 1000).toISOString()})`;
    const json = JSON.stringify(value);
    if (json.length > 200) return `[object ${json.length} chars]`;
    return json;
  }
  return String(value);
}

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).get();
  if (!snap.exists) { console.log('Workspace inexistente'); process.exit(1); }
  const data = snap.data();

  console.log('=== TODAS as chaves do workspace ===');
  const allKeys = Object.keys(data).sort();
  allKeys.forEach(k => console.log(`  ${k.padEnd(28)} = ${summarize(data[k])}`));

  console.log('\n=== Chaves com "rthanc" (case-insensitive) ===');
  const orthancKeys = allKeys.filter(k => /rthanc/i.test(k));
  if (orthancKeys.length === 0) {
    console.log('  Nenhuma. Wader provavelmente nao consegue autenticar no Orthanc.');
  } else {
    orthancKeys.forEach(k => console.log(`  ${k.padEnd(28)} = ${summarize(data[k])}`));
  }

  process.exit(0);
})().catch(err => { console.error('Erro:', err.message); process.exit(1); });
