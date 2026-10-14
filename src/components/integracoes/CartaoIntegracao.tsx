'use client';
import type { ReactNode } from 'react';

type Props = {
  icone: string; titulo: string; descricao: string;
  estado: string; tomEstado: 'ok' | 'erro' | 'neutro';
  children?: ReactNode; acoes?: ReactNode;
};

const TOM: Record<Props['tomEstado'], string> = {
  ok: 'bg-green-100 text-green-800',
  erro: 'bg-red-100 text-red-700',
  neutro: 'bg-gray-100 text-gray-600',
};

export default function CartaoIntegracao({ icone, titulo, descricao, estado, tomEstado, children, acoes }: Props) {
  return (
    <div className="min-w-0 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="flex items-center gap-3 text-[#1E3A5F] text-lg font-semibold">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              {titulo === 'Feegow' ? <path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l2-2" /> : titulo === 'Orthanc' ? <><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6.5h.01M7 17.5h.01" /></> : titulo === 'Wader' ? <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M9 6h7a2 2 0 0 1 2 2v7M6 9v9h9" /></> : <text x="2" y="18">{icone}</text>}
            </svg>
            {titulo}
          </h3>
          <p className="text-sm leading-relaxed text-ink-2 mt-2">{descricao}</p>
        </div>
        <span className={`max-w-full break-words px-2.5 py-1 rounded-md text-xs font-medium ${TOM[tomEstado]}`}>
          {estado}
        </span>
      </div>
      {children}
      {acoes && <div className="flex gap-2 flex-wrap">{acoes}</div>}
    </div>
  );
}
