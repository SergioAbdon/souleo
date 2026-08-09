// Dev (untracked): consulta o FEEGOW (read-only) p/ ver se os agendamentos
// de Carotidas tem convenio_id. node check-feegow-appoints.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const FEEGOW_BASE = 'https://api.feegow.com/v1/api';

// Eco (com UNIMED) x Carotidas (sem convenio) — pares bookados juntos
const ALVO = {
  64379: 'SILVANA · Eco',  64380: 'SILVANA · Carotidas',
  64377: 'BENEDITA · Eco',  64378: 'BENEDITA · Carotidas',
  64388: 'LETICIA · Eco',  65050: 'LETICIA · Carotidas',
};

(async () => {
  const ws = await db.collection('workspaces').doc(wsId).get();
  const token = (ws.data() || {}).feegowToken;
  if (!token) { console.log('Sem feegowToken no workspace.'); process.exit(1); }
  console.log('Token Feegow OK. Consultando agendamentos 09→16/05/2026...\n');

  const url = `${FEEGOW_BASE}/appoints/search?data_start=2026-05-09&data_end=2026-05-16`;
  const r = await fetch(url, { headers: { 'x-access-token': token, 'Content-Type': 'application/json' } });
  const j = await r.json();
  const ags = j?.content || [];
  console.log(`Total agendamentos no periodo: ${ags.length}\n`);

  const alvos = ags.filter(a => ALVO[a.agendamento_id]);
  if (!alvos.length) {
    console.log('Nenhum dos agendamentos-alvo retornou. Chaves do 1o agendamento:');
    console.log(ags[0] ? Object.keys(ags[0]).join(', ') : '(vazio)');
    process.exit(0);
  }

  alvos.sort((a, b) => ALVO[a.agendamento_id].localeCompare(ALVO[b.agendamento_id]));
  for (const a of alvos) {
    console.log(`=== ${ALVO[a.agendamento_id]}  (agendamento_id=${a.agendamento_id}) ===`);
    console.log(`   convenio_id   = ${a.convenio_id ?? '(AUSENTE/null)'}`);
    console.log(`   procedimento_id = ${a.procedimento_id ?? '(ausente)'}`);
    console.log(`   procedimentos = ${JSON.stringify(a.procedimentos ?? '(ausente)')}`);
    console.log(`   data=${a.data}  horario=${a.horario}  status_id=${a.status_id}`);
    console.log('');
  }

  // Tabela de convenios pra traduzir o id
  const cr = await fetch(`${FEEGOW_BASE}/insurance/list`, { headers: { 'x-access-token': token, 'Content-Type': 'application/json' } });
  const cj = await cr.json();
  const conv = {};
  for (const c of cj?.content || []) conv[c.convenio_id] = c.nome;
  console.log('=== Traducao convenio_id -> nome (insurance/list) ===');
  const ids = [...new Set(alvos.map(a => a.convenio_id).filter(x => x != null))];
  if (!ids.length) console.log('  (nenhum convenio_id presente nos alvos)');
  ids.forEach(id => console.log(`  ${id} -> ${conv[id] || '(NAO esta na insurance/list)'}`));
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
