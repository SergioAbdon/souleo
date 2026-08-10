// Dev (untracked): lista COMPLETA de status Feegow + cruza c/ uso real.
// node check-feegow-status2.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const BASE = 'https://api.feegow.com/v1/api';

async function fg(token, path) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'x-access-token': token, 'Content-Type': 'application/json' } });
  return r.json();
}

(async () => {
  const ws = await db.collection('workspaces').doc(wsId).get();
  const token = (ws.data() || {}).feegowToken;

  const st = await fg(token, '/appoints/status');
  const lista = st.content || st;
  const nome = {};
  for (const s of lista) nome[s.id] = s.status;

  console.log('=== LISTA COMPLETA DE STATUS DO FEEGOW (' + lista.length + ') ===');
  lista.sort((a, b) => a.id - b.id).forEach(s => console.log(`  id=${String(s.id).padStart(3)}  ${s.status}`));

  const r = await fg(token, '/appoints/search?data_start=2026-05-01&data_end=2026-05-16');
  const ags = r.content || [];
  const hist = {};
  for (const a of ags) hist[a.status_id] = (hist[a.status_id] || 0) + 1;

  console.log(`\n=== USO REAL (01->16/05, ${ags.length} agendamentos) ===`);
  Object.entries(hist).sort((a, b) => b[1] - a[1]).forEach(([id, q]) =>
    console.log(`  ${String(q).padStart(3)}x  id=${String(id).padStart(3)}  ${nome[id] || '(?? nao esta na lista)'}`));

  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
