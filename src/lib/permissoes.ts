// ══════════════════════════════════════════════════════════════════
// LEO · Permissoes de UI (Plano 2B-A) — a matriz §4 do ADR em codigo puro.
// A FECHADURA no Firestore e a trava real; isto so decide o que a tela
// OFERECE. Sem I/O, sem import @/ — testado direto por node --test.
// ══════════════════════════════════════════════════════════════════
export type Papel = 'dono' | 'medico' | 'recepcao';

type PerfilLite = { tipoPerfil?: string } | null | undefined;
type ExameLite = { medicoUid?: string } | null | undefined;

// tipoPerfil ausente conta como medico (default do resto do app, nao pode
// travar perfis antigos sem o campo — licao do apagao de cadastro 09/08) OU
// == 'medico'. Qualquer outro valor ('assistente', 'gestor', typo) nao e
// medico — mesmo criterio do /api/emitir e da fechadura (ehMedicoDeVerdade).
export function ehMedico(perfil: PerfilLite): boolean {
  return (perfil?.tipoPerfil ?? 'medico') === 'medico';
}

// Assinar/editar laudo = ser medico de perfil E ser o autor (ou exame sem autor).
// NAO depende do papel administrativo — corrige o gate antigo `role==='medico'`
// que escondia o botao do dono-medico (papel 'dono').
export function podeEditarLaudo(perfil: PerfilLite, exame: ExameLite, uid: string): boolean {
  if (!ehMedico(perfil)) return false;
  const autor = exame?.medicoUid;
  return !autor || autor === uid;
}

// Cancelar laudo emitido: o dono (administrativo) ou o medico autor. Recepcao nao.
// (A rota /api/exame acao:'cancelar' devolve franquia, loga e apaga o PDF.)
export function podeCancelarLaudo(
  perfil: PerfilLite, exame: ExameLite, uid: string, papel: Papel | null | undefined,
): boolean {
  if (papel === 'dono') return true;
  if (papel === 'medico' && ehMedico(perfil)) return exame?.medicoUid === uid;
  return false;
}

export function podeVerFinanceiro(papel: Papel | null | undefined): boolean {
  return papel === 'dono' || papel === 'medico';
}
export function podeEditarLocal(papel: Papel | null | undefined): boolean {
  return papel === 'dono';
}
export function podeGerenciarMembros(papel: Papel | null | undefined): boolean {
  return papel === 'dono';
}
// Recepcao nao remove exame da fila (P4 do Plano 2A).
export function podeRemoverDaFila(papel: Papel | null | undefined): boolean {
  return papel === 'dono' || papel === 'medico';
}
// Integracoes guardam credencial de sistema: so o dono (D5 da spec do Sub-plano 5).
export function podeVerIntegracoes(papel: Papel | null | undefined): boolean {
  return papel === 'dono';
}

// Fluxo de entrada por quantidade de locais acessiveis (A2 do spec).
export function modoEntrada(qtdLocais: number): 'sem-local' | 'entrar' | 'escolher' {
  if (qtdLocais <= 0) return 'sem-local';
  if (qtdLocais === 1) return 'entrar';
  return 'escolher';
}
