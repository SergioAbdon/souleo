'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · Integrações — Feegow, Orthanc e Wader (Sub-plano 5, Task 2)
// Nesta task a tela só LÊ: sem botões, sem campo de credencial. Gate
// de tela ecoa podeVerIntegracoes/regra do Firestore, não a substitui.
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { podeVerIntegracoes } from '@/lib/permissoes';
import { TIPOS_INTEGRACAO, rotuloEstado, type Integracao, type TipoIntegracao } from '@/lib/integracoes';
import PageHeader from '@/components/shell/PageHeader';
import CartaoIntegracao from '@/components/integracoes/CartaoIntegracao';

// Timestamp do Firestore -> ms; já em number ou ausente passa direto.
const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | number | null | undefined;
  if (t && typeof t === 'object' && typeof t.toMillis === 'function') return t.toMillis();
  return typeof t === 'number' ? t : null;
};

function normalizar(tipo: TipoIntegracao, data: Record<string, unknown>): Integracao {
  return {
    ...data,
    tipo,
    ultimoTeste: ms(data.ultimoTeste),
    ultimaSync: ms(data.ultimaSync),
    visto: ms(data.visto),
  } as Integracao;
}

export default function IntegracoesPage() {
  const { workspace, papel } = useAuth();
  const wsId = workspace?.id || '';
  const podeVer = podeVerIntegracoes(papel);

  const [porTipo, setPorTipo] = useState<Record<string, Integracao>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wsId || !podeVer) { setLoading(false); return; }
    setLoading(true);
    getDocs(collection(db, 'workspaces', wsId, 'integracoes')).then(snap => {
      const idx: Record<string, Integracao> = {};
      snap.forEach(d => { idx[d.id] = normalizar(d.id as TipoIntegracao, d.data()); });
      setPorTipo(idx);
      setLoading(false);
    });
  }, [wsId, podeVer]);

  return (
    <>
      <PageHeader titulo="Integrações" />
      {!podeVer ? (
        <div className="bg-card border border-borda rounded-xl p-4 text-sm text-ink-3">
          Esta seção é do responsável pela conta.
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-ink-3">
          <span className="text-3xl animate-pulse">🔌</span>
          <p className="text-sm mt-2">Carregando integrações...</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TIPOS_INTEGRACAO.map(t => {
            const i = porTipo[t.id] ?? { tipo: t.id };
            const estado = rotuloEstado(i, Date.now());
            const noAr = t.id === 'wader' && !!i.visto && Date.now() - i.visto <= (15 * 60 * 1000);
            const semSinal = t.id === 'wader' && !!i.visto && Date.now() - i.visto > (15 * 60 * 1000);
            const tomEstado = i.status === 'ok' || noAr ? 'ok' : i.status === 'erro' || semSinal ? 'erro' : 'neutro';
            return (
              <CartaoIntegracao key={t.id} icone={t.icone} titulo={t.rotulo} descricao={t.descricao}
                estado={estado} tomEstado={tomEstado}>
                {t.id === 'feegow' && (
                  <p className="text-xs text-ink-3">{Object.keys(i.procMap ?? {}).length} procedimento(s) mapeado(s)</p>
                )}
                {t.id === 'orthanc' && (
                  <p className="text-xs text-ink-3">{i.url || 'Sem endereço cadastrado'} · {i.ativo ? 'ativo' : 'inativo'}</p>
                )}
                {t.id === 'wader' && (
                  <p className="text-xs text-ink-3">{i.versao ? `v${i.versao}` : 'Versão desconhecida'} · {i.maquina || 'máquina desconhecida'}</p>
                )}
              </CartaoIntegracao>
            );
          })}
        </div>
      )}
    </>
  );
}
