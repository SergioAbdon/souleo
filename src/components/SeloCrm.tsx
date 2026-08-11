'use client';
// Selo INTERNO do estado de verificacao de CRM (Plano 2B-B1, B5 do spec).
// NUNCA entra no laudo (PDF) — e controle interno. So aparece para perfil medico.
import { useAuth } from '@/contexts/AuthContext';

export default function SeloCrm() {
  const { profile } = useAuth();
  if ((profile?.tipoPerfil ?? 'medico') === 'assistente') return null;   // so medico tem CRM
  const v = (profile?.crmVerificacao ?? { status: 'nao_verificado' }) as { status: string; checadoEm?: string | null };

  if (v.status === 'verificado') {
    const quando = v.checadoEm ? new Date(v.checadoEm).toLocaleDateString('pt-BR') : '';
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">CRM verificado no CFM{quando ? ` · ${quando}` : ''}</span>;
  }
  if (v.status === 'reprovado') {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">CRM não confirmado — falar com o suporte</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold" title="Verificação automática de CRM em breve">CRM informado — verificação em breve</span>;
}
