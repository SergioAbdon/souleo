// ══════════════════════════════════════════════════════════════════
// LEO · Verificacao de CRM (Plano 2B-B1) — interface PLUGAVEL.
// Provedor no-op agora: o cadastro exige+guarda CRM (a trava), mas nao ha
// verificacao externa ainda. Quando o Dr. Sergio escolher Consultar.IO ou o
// webservice do CFM, um novo provedor implementa VerificarCrm e a rota passa
// a injeta-lo — sem tocar cadastro nem regra. Pesquisa das fontes no ADR.
// Sem import relativo/@: signup-server importa o TIPO e recebe a FUNCAO por
// parametro (DI), para continuar testavel por node --test.
// ══════════════════════════════════════════════════════════════════
export type CrmVerificacao = {
  status: 'nao_verificado' | 'verificado' | 'reprovado';
  fonte: string;
  checadoEm: string | null;
};

export type VerificarCrm = (crm: string, uf: string) => Promise<CrmVerificacao>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const verificarCrmNoOp: VerificarCrm = async (crm, uf) => ({
  status: 'nao_verificado', fonte: 'nenhum', checadoEm: null,
});
