// Fixtures compartilhadas pelas duas suites de regra.
//
// Existe por um motivo especifico: em 09/08/2026 um teste de cadastro usava um
// payload INVENTADO (`{nome, crm}`) e por isso nao pegou que a regra publicada
// quebrava todo cadastro novo — o app manda doze campos, um deles fatal. Uma
// copia unica do payload REAL impede que as duas suites divirjam de novo.

/**
 * Payload identico ao que `createProfile()` envia (src/lib/firestore.ts).
 * O `superadmin: false` e o detalhe que importa: exigir o campo AUSENTE
 * bloqueia todo cadastro novo em producao.
 */
export const payloadCreateProfile = (uid, extra = {}) => ({
  uid,
  nome: 'Novo Usuario',
  email: 'novo@exemplo.com',
  crm: '123',
  ufCrm: 'PA',
  especialidade: 'Cardiologia',
  cpf: '',
  rqe: '',
  tipoPerfil: 'assistente',
  superadmin: false,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  ...extra,
});

/**
 * Payload identico ao cadastro manual da Worklist (handleSalvarPaciente →
 * saveExame create, src/components/Worklist.tsx + src/lib/firestore.ts).
 * SEM medicoUid: apos a correcao do Achado 1, exame criado por quem nao
 * assina nasce orfao (um medico do local assume depois, no salvarLaudo).
 */
export const payloadCadastroExame = (extra = {}) => ({
  id: 'exNovo',
  acc: 'EX12082610300000',
  pacienteId: 'pac1',
  pacienteNome: 'PACIENTE NOVO',
  pacienteDtnasc: '1980-01-02',
  cpf: '12345678900',
  tipoExame: 'eco_tt',
  dataExame: '2026-08-12',
  horarioChegada: '10:30',
  status: 'aguardando',
  convenio: 'UNIMED',
  solicitante: '',
  medicoExecutor: '',
  sexo: 'F',
  origem: 'MANUAL',
  versao: 1,
  criadoEm: new Date(),
  ...extra,
});

/**
 * Payload identico a EDICAO de paciente pela Worklist (handleSalvarPaciente
 * com editExameId → writeBatch, Task 3). Inclui cpf (Achado 8) e atualizadoEm.
 */
export const payloadEditarExame = (extra = {}) => ({
  pacienteNome: 'PACIENTE CORRIGIDO',
  pacienteDtnasc: '1980-01-02',
  cpf: '22222222222',
  convenio: 'BRADESCO',
  solicitante: 'DR FULANO',
  tipoExame: 'doppler_carotidas',
  sexo: 'F',
  atualizadoEm: new Date(),
  ...extra,
});

/**
 * Payload identico ao que a tela Clinica→Tipos de laudo grava (Task 3).
 */
export const payloadTipoLaudo = (extra = {}) => ({
  id: 'ecg',
  nome: 'ECG',
  icone: '📈',
  ativo: true,
  ordem: 5,
  modalidade: 'pdf',
  atualizadoEm: new Date(),
  ...extra,
});
