'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · Integrações — Feegow, Orthanc e Wader (Sub-plano 5, Task 2 + 3)
// Task 2: tela só lê. Task 3: botão "Testar conexão" (exceto Wader, que
// avisa sozinho por batimento) chama /api/integracoes — a credencial
// nunca passa pelo cliente, só o resultado (ok/erro + mensagem). Gate
// de tela ecoa podeVerIntegracoes/regra do Firestore, não a substitui.
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { podeVerIntegracoes } from '@/lib/permissoes';
import { TIPOS_INTEGRACAO, rotuloEstado, tomEstado, type Integracao, type TipoIntegracao } from '@/lib/integracoes';
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
  const { user, workspace, papel, loading: authLoading } = useAuth();
  const wsId = workspace?.id || '';
  // papel so resolve depois do membership carregar (useAuth().loading) — sem
  // isso o dono via "Esta secao e do responsavel" piscar antes do conteudo.
  const podeVer = podeVerIntegracoes(papel);

  const [porTipo, setPorTipo] = useState<Record<string, Integracao>>({});
  const [loading, setLoading] = useState(true);
  const [testando, setTestando] = useState<TipoIntegracao | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!wsId || !podeVer) { setLoading(false); return; }
    setLoading(true);
    getDocs(collection(db, 'workspaces', wsId, 'integracoes')).then(snap => {
      const idx: Record<string, Integracao> = {};
      snap.forEach(d => { idx[d.id] = normalizar(d.id as TipoIntegracao, d.data()); });
      setPorTipo(idx);
      setLoading(false);
    });
  }, [wsId, podeVer, authLoading]);

  // Recarrega SÓ o doc testado (mesma normalizacao do carregamento inicial —
  // senão o cartão faz conta com Timestamp cru e mostra NaN).
  async function recarregar(tipo: TipoIntegracao) {
    const snap = await getDoc(doc(db, 'workspaces', wsId, 'integracoes', tipo));
    if (snap.exists()) setPorTipo(prev => ({ ...prev, [tipo]: normalizar(tipo, snap.data()) }));
  }

  async function testarConexao(tipo: TipoIntegracao) {
    if (!user || testando) return;
    setTestando(tipo);
    try {
      const idToken = await user.getIdToken();
      await fetch('/api/integracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ acao: 'testar', wsId, tipo }),
      });
      await recarregar(tipo);
    } finally {
      setTestando(null);
    }
  }

  // Uma unica leitura do relogio por render: rotuloEstado e tomEstado usam o
  // mesmo `agora`, senao cor e texto podem divergir num render raro.
  const agora = Date.now();

  return (
    <>
      <PageHeader titulo="Integrações" />
      {authLoading || loading ? (
        <div className="text-center py-12 text-ink-3">
          <span className="text-3xl animate-pulse">🔌</span>
          <p className="text-sm mt-2">Carregando integrações...</p>
        </div>
      ) : !podeVer ? (
        <div className="bg-card border border-borda rounded-xl p-4 text-sm text-ink-3">
          Esta seção é do responsável pela conta.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TIPOS_INTEGRACAO.map(t => {
            const configurado = !!porTipo[t.id];
            const i = porTipo[t.id] ?? { tipo: t.id };
            const estado = rotuloEstado(i, agora);
            const tom = tomEstado(i, agora);
            return (
              <CartaoIntegracao key={t.id} icone={t.icone} titulo={t.rotulo} descricao={t.descricao}
                estado={estado} tomEstado={tom}
                acoes={t.id !== 'wader' ? (
                  <button type="button" onClick={() => testarConexao(t.id)} disabled={testando !== null}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-borda text-ink-2 hover:bg-surface transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {testando === t.id ? 'testando…' : '🔌 Testar conexão'}
                  </button>
                ) : undefined}>
                {t.id === 'feegow' && (
                  <p className="text-xs text-ink-3">{Object.keys(i.procMap ?? {}).length} procedimento(s) mapeado(s)</p>
                )}
                {t.id === 'orthanc' && (
                  <p className="text-xs text-ink-3">{i.url || 'Sem endereço cadastrado'} · {configurado ? (i.ativo ? 'ativo' : 'inativo') : 'Não configurado'}</p>
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
