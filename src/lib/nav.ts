// Navegação da plataforma (spec §3). Dado puro — a Sidebar renderiza isto.
// Sub-planos seguintes ACRESCENTAM itens (Pacientes, Integrações) aqui.
import { podeVerFinanceiro, podeGerenciarMembros, type Papel } from './permissoes.ts';

export type ItemNav = { href: string; rotulo: string; icone: string };

export const NAV_PLATAFORMA: ItemNav[] = [
  { href: '/agenda', rotulo: 'Agenda', icone: '📋' },
  { href: '/laudos', rotulo: 'Laudos', icone: '🗂️' },
  { href: '/financeiro', rotulo: 'Financeiro', icone: '💰' },
  { href: '/clinica', rotulo: 'Clínica', icone: '🏥' },
];

export function itensVisiveis(papel: Papel | null | undefined): ItemNav[] {
  return NAV_PLATAFORMA.filter(i => {
    if (i.href === '/financeiro') return podeVerFinanceiro(papel);
    // /clinica: todos entram (dados básicos); as subseções internas de
    // gestão (Equipe/Plano) gateiam por podeGerenciarMembros lá dentro.
    return true;
  });
}
