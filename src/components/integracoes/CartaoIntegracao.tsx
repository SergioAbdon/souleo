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
    <div className="bg-card border border-borda rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-ink font-semibold">{icone} {titulo}</h3>
          <p className="text-xs text-ink-3">{descricao}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${TOM[tomEstado]}`}>
          {estado}
        </span>
      </div>
      {children}
      {acoes && <div className="flex gap-2 flex-wrap">{acoes}</div>}
    </div>
  );
}
