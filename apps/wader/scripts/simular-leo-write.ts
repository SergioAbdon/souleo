/**
 * Simula o LEO web importando agendamento do Feegow.
 *
 * Replica EXATAMENTE o batch write feito por src/components/Worklist.tsx:264-301
 * quando importa do Feegow. Resultado esperado: o Wader (que lê de
 * workspaces/{wsId}/exames) consegue listar este exame normalmente.
 *
 * Por que não chamar /api/feegow do LEO real? Pra evitar dependência de token
 * Feegow + Vercel rodando + workspace de produção. Este script prova que se
 * LEO web fizer o que JÁ FAZ HOJE em código, Wader lê sem mudar nada.
 *
 * Uso: npx tsx scripts/simular-leo-write.ts
 */

import { loadConfig } from '../src/config/load';
import { initFirebase, getDb, FieldValue } from '../src/adapters/firebase';

const TARGET_WS_ID = 'wader-dev';

// CPF válido pra teste (passou validação de dígitos verificadores)
const PACIENTE_FAKE = {
  pacienteNome: 'PACIENTE VINDO DO FEEGOW',
  cpf: '11144477735',
  pacienteDtnasc: '1975-08-22',
  sexo: 'F',
  telefone: '11999998888',
  convenio: 'UNIMED',
  tipoExame: 'eco_tt',
  dataExame: hojeIso(),
  horarioChegada: '14:00',
  feegowAppointId: 'FEEGOW-FAKE-12345',
};

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Simular escrita do LEO web (importação Feegow)');
  console.log('═══════════════════════════════════════════════\n');

  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  console.log(`▸ Workspace alvo: ${TARGET_WS_ID}`);
  console.log(`▸ Replicando batch write de Worklist.tsx:264-301 do LEO web\n`);

  // Replica EXATAMENTE o batch do LEO web (Worklist.tsx:264-301)
  const wsRef = db.collection('workspaces').doc(TARGET_WS_ID);
  const pacRef = wsRef.collection('pacientes').doc();
  const exameRef = wsRef.collection('exames').doc();

  const batch = db.batch();

  batch.set(pacRef, {
    id: pacRef.id,
    nome: PACIENTE_FAKE.pacienteNome,
    cpf: PACIENTE_FAKE.cpf,
    dtnasc: PACIENTE_FAKE.pacienteDtnasc,
    sexo: PACIENTE_FAKE.sexo,
    telefone: PACIENTE_FAKE.telefone,
    criadoEm: FieldValue.serverTimestamp(),
  });

  batch.set(exameRef, {
    id: exameRef.id,
    pacienteId: pacRef.id,
    pacienteNome: PACIENTE_FAKE.pacienteNome,
    pacienteDtnasc: PACIENTE_FAKE.pacienteDtnasc,
    tipoExame: PACIENTE_FAKE.tipoExame,
    dataExame: PACIENTE_FAKE.dataExame,
    horarioChegada: PACIENTE_FAKE.horarioChegada,
    status: 'aguardando',
    convenio: PACIENTE_FAKE.convenio,
    solicitante: 'Dr. Sergio Abdon',
    sexo: PACIENTE_FAKE.sexo,
    origem: 'FEEGOW',
    feegowAppointId: PACIENTE_FAKE.feegowAppointId,
    medicoUid: 'medico-uid-simulado',
    versao: 1,
    criadoEm: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  console.log('✓ Batch commit OK');
  console.log(`  pacienteId: ${pacRef.id}`);
  console.log(`  exameId:    ${exameRef.id}`);
  console.log(`  origem:     FEEGOW`);
  console.log(`  cpf:        ${PACIENTE_FAKE.cpf}`);
  console.log(`  data:       ${PACIENTE_FAKE.dataExame}`);
  console.log(`  hora:       ${PACIENTE_FAKE.horarioChegada}\n`);

  console.log('▸ Agora suba o Wader (npm start) e:');
  console.log('  curl http://localhost:8043/api/agendamentos\\?data=' + PACIENTE_FAKE.dataExame);
  console.log('  → Deve listar este exame com origem=FEEGOW\n');

  process.exit(0);
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error('\n❌ Erro:', err);
  process.exit(1);
});
