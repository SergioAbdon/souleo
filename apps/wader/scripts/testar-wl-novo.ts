/**
 * Gera um .wl de teste com dados realistas (com acentos), salva em disco,
 * e roda o inspetor pra confirmar que SpecificCharacterSet ficou ISO_IR 100.
 *
 * Uso: npx tsx scripts/testar-wl-novo.ts
 */
import * as fs from 'node:fs';
import { gerarWlBuffer } from '../src/workers/wl-writer';
import { Exame } from '../src/types/exame';

const exameTeste: Exame = {
  id: 'TESTE_NOVO_FORMATO',
  pacienteId: 'paciente-uuid-teste',
  pacienteNome: 'SÉRGIO ROBERTO ABDON RODRIGUES',
  pacienteDtnasc: '1980-09-08',
  sexo: 'M',
  tipoExame: 'eco_tt',
  dataExame: '2026-05-08',
  horarioChegada: '14:00',
  status: 'aguardando',
  origem: 'MANUAL',
  medicoUid: 'wader-agent',
  versao: 1,
  solicitante: 'Dr. José da Silva',
};

const buffer = gerarWlBuffer(exameTeste, {
  scheduledStationName: 'VIVIDT8-SALA1',
  scheduledProcedureStepLocation: 'MEDCARDIO',
});
const path = 'C:\\Users\\sergi\\Desktop\\teste-wader-novo.wl';
fs.writeFileSync(path, buffer);

console.log(`✓ .wl gerado: ${path} (${buffer.length} bytes)`);
console.log(`\nAgora roda:\n  npx tsx scripts/inspecionar-wl.ts ${path}`);
