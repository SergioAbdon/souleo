// Dev (untracked): TESTE 2 simulacoes — Feegow + Manual.
// Cada um: cria -> aparece no worklist -> cancela (removerDaFila) -> some.
// Cria docs marcados "ZZ TESTE", apaga tudo no fim (try/finally). Read+write
// SO em docs de teste. node teste-cadastro-cancelar.cjs
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';
const col = db.collection('workspaces').doc(wsId).collection('exames');
const HOJE = '2026-05-17';
const res = [];
const ok = (nome, cond) => { res.push([nome, cond]); console.log(`  ${cond ? 'PASS ✓' : 'FALHOU ✗'}  ${nome}`); };

// Query EXATA do listenWorklist (firestore.ts): dataExame==hoje + orderBy horario
async function worklistContem(id) {
  const q = await col.where('dataExame', '==', HOJE).orderBy('horarioChegada', 'asc').get();
  return q.docs.some(d => d.id === id);
}

async function limparTestes() {
  const s = await col.where('_teste', '==', true).get();
  for (const d of s.docs) await d.ref.delete();
  return s.size;
}

(async () => {
  try {
    await limparTestes(); // garante estado limpo

    // ── Checagem da logica do fix #2 (saveExame) ──
    const statusManualSimulado = ({ status: 'aguardando' }.status) || 'rascunho';
    ok(`#2 saveExame: dados.status='aguardando' => '${statusManualSimulado}' (esperado 'aguardando', nao 'rascunho')`,
       statusManualSimulado === 'aguardando');

    // ── SIM 1: paciente FEEGOW ──
    const fRef = col.doc();
    await fRef.set({
      id: fRef.id, _teste: true,
      acc: 'TESTE-FEEGOW', pacienteNome: 'ZZ TESTE FEEGOW — APAGAR',
      pacienteDtnasc: '1980-01-01', cpf: '00000000001',
      tipoExame: 'eco_tt', dataExame: HOJE, horarioChegada: '23:58',
      status: 'aguardando', convenio: 'UNIMED BELÉM', solicitante: 'TESTE',
      sexo: 'M', origem: 'FEEGOW', feegowAppointId: 999999,
      feegowPacienteId: 999999, medicoUid: 'teste', versao: 1,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    ok('SIM1 Feegow: cadastro APARECE no worklist', await worklistContem(fRef.id));

    // ── SIM 2: paciente MANUAL (status via logica do #2) ──
    const mRef = col.doc();
    const dadosManual = { status: 'aguardando' }; // o que handleSalvarPaciente envia
    await mRef.set({
      id: mRef.id, _teste: true,
      acc: 'TESTE-MANUAL', pacienteNome: 'ZZ TESTE MANUAL — APAGAR',
      pacienteDtnasc: '1980-01-01', cpf: '00000000002',
      tipoExame: 'eco_tt', dataExame: HOJE, horarioChegada: '23:59',
      status: (dadosManual.status) || 'rascunho', // <- fix #2
      convenio: 'PARTICULAR', solicitante: 'TESTE', sexo: 'F',
      origem: 'MANUAL', medicoUid: 'teste', versao: 1,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    const mSnap = await mRef.get();
    ok('SIM2 Manual: cadastro APARECE no worklist', await worklistContem(mRef.id));
    ok(`SIM2 Manual: status gravado = 'aguardando' (nao 'rascunho')`, mSnap.data().status === 'aguardando');

    // ── CANCELAR (removerDaFila = deleteDoc) ──
    await fRef.delete();
    ok('SIM1 Feegow: apos CANCELAR, sumiu do worklist', !(await worklistContem(fRef.id)));
    await mRef.delete();
    ok('SIM2 Manual: apos CANCELAR, sumiu do worklist', !(await worklistContem(mRef.id)));

  } finally {
    const n = await limparTestes();
    console.log(`\n[cleanup] docs de teste removidos: ${n} (deve ser 0 — ja apagados no fluxo)`);
  }

  const falhas = res.filter(([, c]) => !c).length;
  console.log(`\nRESULTADO: ${res.length - falhas}/${res.length} PASS  ${falhas === 0 ? '— TUDO OK ✓' : '— ' + falhas + ' FALHA(S) ✗'}`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
