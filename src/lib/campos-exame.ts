// Whitelist dos campos do exame que NAO sao ato medico (achado 16 da revisao da
// Secao 2). A mesma lista existe em firestore.rules, na funcao
// camposAdministrativos(), e e ela que decide se a recepcao consegue gravar:
// por ser whitelist, qualquer campo fora dela e negado (fail-closed).
//
// Duas listas que precisam concordar e nada obrigando e a armadilha que ja
// mordeu este projeto duas vezes (ortancAtivo, feegowProcMap). Aqui as duas
// pontas ficam presas: `tests/unit/campos-exame.test.mjs` le firestore.rules e
// falha se divergir, e `soAdministrativos` recusa montar um payload com campo
// fora da lista — entao um campo novo esquecido na regra estoura no
// desenvolvimento, em vez de virar "a recepcao nao consegue salvar" na clinica.
//
// Sem import local de proposito: `node --test` nao resolve import relativo
// encadeado entre .ts (mesmo padrao de nav.ts e paciente-fmt.ts).

export const CAMPOS_EXAME_ADMINISTRATIVOS: readonly string[] = [
  'id', 'acc', 'pacienteId', 'pacienteNome', 'pacienteDtnasc',
  'cpf', 'feegowPacienteId', 'tipoExame', 'dataExame', 'horarioChegada',
  'status', 'convenio', 'solicitante', 'medicoExecutor', 'sexo', 'origem',
  'feegowAppointId', 'medicoUid', 'mwlStatus', 'versao', 'criadoEm', 'atualizadoEm',
];

/**
 * Devolve `dados` intacto se todo campo estiver na whitelist; se nao estiver,
 * lanca. Usar em TODA escrita de exame vinda do cliente que a recepcao tambem
 * faz — a regra negaria em silencio, e o erro apareceria como "nao consegui
 * salvar" sem dizer por que.
 */
export function soAdministrativos<T extends Record<string, unknown>>(dados: T): T {
  const foraDaLista = Object.keys(dados).filter(k => !CAMPOS_EXAME_ADMINISTRATIVOS.includes(k));
  if (foraDaLista.length > 0) {
    throw new Error(
      `Campo(s) fora da whitelist administrativa do exame: ${foraDaLista.join(', ')}. ` +
      'Some a firestore.rules > camposAdministrativos() E a CAMPOS_EXAME_ADMINISTRATIVOS, ' +
      'ou grave por uma rota de servidor — senao a recepcao nao consegue salvar.'
    );
  }
  return dados;
}
