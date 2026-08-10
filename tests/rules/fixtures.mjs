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
