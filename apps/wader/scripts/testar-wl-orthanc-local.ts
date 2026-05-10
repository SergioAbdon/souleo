/**
 * Gera 2 .wl de teste com TODAS as decisoes DICOM da sessao 09/05/2026 aplicadas
 * (acc, medicoExecutor, cpf, MEDCARDIO defaults) e salva direto na pasta
 * worklists do Orthanc LOCAL pra debug com findscu.
 *
 * Pre-requisito: Orthanc local rodando, pasta C:\OrthancLocal\worklists existe
 *
 * Uso: npx tsx scripts/testar-wl-orthanc-local.ts
 *
 * Depois inspecionar com:
 *   npx tsx scripts/inspecionar-wl.ts C:\OrthancLocal\worklists\EX09052622000045.wl
 *
 * E testar com findscu (simula Vivid):
 *   findscu -W -k "ScheduledStationAETitle=" -k "PatientName=" \
 *     localhost 4242 -aec ORTHANC -aet TESTE
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gerarWlBuffer } from '../src/workers/wl-writer';
import { Exame } from '../src/types/exame';

const WORKLIST_DIR = 'C:\\OrthancLocal\\worklists';

if (!fs.existsSync(WORKLIST_DIR)) {
  console.error(`Pasta nao existe: ${WORKLIST_DIR}`);
  console.error('Crie com: mkdir C:\\OrthancLocal\\worklists');
  process.exit(1);
}

// Exame 1: Eco TT Sergio (paciente medico — bagunca proposital pra teste)
const exame1: Exame = {
  id: 'doc-id-firestore-aaa',
  acc: 'EX09052622000045', // formato decidido EX{ddmmaa}{hhmmsscc}
  pacienteId: 'pac-uuid-1',
  pacienteNome: 'SERGIO ROBERTO ABDON RODRIGUES',
  pacienteDtnasc: '1980-09-08',
  sexo: 'M',
  cpf: '67068855253', // hierarquia: CPF tem prioridade
  tipoExame: 'eco_tt',
  dataExame: '2026-05-09',
  horarioChegada: '14:00',
  status: 'aguardando',
  origem: 'MANUAL',
  medicoUid: 'wader-agent',
  medicoExecutor: 'Dr. Sergio Roberto Abdon Rodrigues',
  versao: 1,
};

// Exame 2: Doppler carotidas Amanda
const exame2: Exame = {
  id: 'doc-id-firestore-bbb',
  acc: 'EX09052622150067',
  pacienteId: 'pac-uuid-2',
  pacienteNome: 'AMANDA MAGNO DE PARIJOS ABDON RODRIGUES',
  pacienteDtnasc: '1986-07-17',
  sexo: 'F',
  cpf: '89304802253',
  tipoExame: 'doppler_carotidas',
  dataExame: '2026-05-09',
  horarioChegada: '14:15',
  status: 'aguardando',
  origem: 'FEEGOW',
  feegowAppointId: '64990',
  feegowPacienteId: '13085',
  profissionalId: 1,
  medicoUid: 'wader-agent',
  medicoExecutor: 'Dr. Sergio Roberto Abdon Rodrigues',
  versao: 1,
};

const exames = [exame1, exame2];

for (const exame of exames) {
  const buffer = gerarWlBuffer(exame, {
    scheduledStationName: 'MEDCARDIO',
    scheduledProcedureStepLocation: 'MEDCARDIO',
  });
  const filename = `${exame.acc}.wl`;
  const fullPath = path.join(WORKLIST_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  console.log(`OK ${filename} (${buffer.length} bytes) - ${exame.pacienteNome}`);
}

console.log(`\n${exames.length} .wl gerados em ${WORKLIST_DIR}`);
console.log(`\nProximo: rodar findscu pra simular query do Vivid:`);
console.log(`  findscu -W -k "PatientName=" -k "PatientID=" -k "AccessionNumber="  -k "ScheduledStationAETitle=" -k "Modality="  localhost 4242 -aec ORTHANC -aet TESTE`);
