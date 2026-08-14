import { redirect } from 'next/navigation';

// O dashboard-monolito virou o shell da plataforma (spec 2026-08-13).
// Bookmarks e fluxos antigos (login, laudo "voltar") caem na Agenda.
export default function DashboardRedirect() {
  redirect('/agenda');
}
