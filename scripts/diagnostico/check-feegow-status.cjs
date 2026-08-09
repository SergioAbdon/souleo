// Dev (untracked): descobre os status_id possiveis no Feegow (read-only).
// node check-feegow-status.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const BASE = 'https://api.feegow.com/v1/api';

async function fg(token, path) {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: { 'x-access-token': token, 'Content-Type': 'application/json' } });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch (e) { return { status: 0, json: null, err: e.message }; }
}

(async () => {
  const ws = await db.collection('workspaces').doc(wsId).get();
  const token = (ws.data() || {}).feegowToken;
  if (!token) { console.log('Sem feegowToken'); process.exit(1); }

  // 1) Tenta endpoints candidatos de "lista de status"
  console.log('=== 1. Endpoints candidatos de lista de status ===');
  for (const p of ['/appoints/status', '/appoints/list-status', '/appointment/status',
                    '/appoints/status-list', '/status/list', '/appoints/situacao']) {
    const r = await fg(token, p);
    const ok = r.json && (r.json.success === true || r.json.content);
    console.log(`  ${p.padEnd(26)} HTTP ${r.status}  ${ok ? 'OK -> ' + JSON.stringify(r.json.content || r.json).slice(0, 300) : '(sem/erro)'}`);
  }

  // 2) Agrega status reais dos agendamentos (range amplo, sem filtro de status)
  console.log('\n=== 2. status_id reais nos agendamentos 01->16/05/2026 ===');
  const r = await fg(token, '/appoints/search?data_start=2026-05-01&data_end=2026-05-16');
  const ags = (r.json && r.json.content) || [];
  console.log(`  total agendamentos: ${ags.length}  (HTTP ${r.status})`);
  if (ags.length) {
    console.log('  chaves de 1 agendamento:\n   ' + Object.keys(ags[0]).join(', '));
    // procura campos relacionados a status
    const camposStatus = Object.keys(ags[0]).filter(k => /status|situa|estado/i.test(k));
    console.log('  campos c/ "status/situacao":', camposStatus.join(', ') || '(nenhum)');
    const hist = {};
    for (const a of ags) {
      const key = camposStatus.map(c => `${c}=${JSON.stringify(a[c])}`).join(' | ') || '(sem campo status)';
      hist[key] = (hist[key] || 0) + 1;
    }
    console.log('  histograma (status -> qtd):');
    Object.entries(hist).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(v).padStart(3)}x  ${k}`));
    console.log('  exemplo de 1 agendamento (campos status + alguns):');
    const a0 = ags[0];
    ['agendamento_id','paciente_id','procedimento_id','data','horario',
     ...camposStatus].forEach(c => console.log(`    ${c} = ${JSON.stringify(a0[c])}`));
  }
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
