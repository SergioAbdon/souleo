// Navegação da plataforma (spec §3). Dado puro — a Sidebar renderiza isto.
// Sub-planos seguintes ACRESCENTAM itens (Pacientes, Integrações) aqui.
//
// Import só de TIPO (apagado em runtime): node --test não resolve import
// relativo sem extensão entre .ts, e import com .ts quebra o tsc (TS5097).
// O gate de papel abaixo espelha podeVerFinanceiro (permissoes.ts, matriz §4)
// — 1 linha, travada pelos testes de nav.test.mjs.
import type { Papel } from './permissoes';

export type ItemNav = { href: string; rotulo: string; icone: string };

export const NAV_PLATAFORMA: ItemNav[] = [
  { href: '/agenda', rotulo: 'Agenda', icone: '📋' },
  { href: '/pacientes', rotulo: 'Pacientes', icone: '👥' },
  { href: '/laudos', rotulo: 'Laudos', icone: '🗂️' },
  { href: '/financeiro', rotulo: 'Financeiro', icone: '💰' },
  { href: '/clinica', rotulo: 'Clínica', icone: '🏥' },
];

export function itensVisiveis(papel: Papel | null | undefined): ItemNav[] {
  // /clinica: todos entram (dados básicos); subseções de gestão gateiam lá dentro.
  return NAV_PLATAFORMA.filter(i =>
    i.href !== '/financeiro' || papel === 'dono' || papel === 'medico');
}
