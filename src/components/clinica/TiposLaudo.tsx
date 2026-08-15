'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · Clínica → Tipos de laudo (catálogo editável, Sub-plano 3)
// Dono configura workspaces/{wsId}/tiposLaudo/{tipoId}. Regra fail-closed
// (firestore.rules) já trava escrita a dono + whitelist de campos —
// aqui só espelhamos a mesma whitelist no payload.
// ══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { TIPOS_LAUDO_PADRAO, type ModalidadeLaudo, type TipoLaudo } from '@/lib/tipos-laudo';
import EditorLaudo, { type EditorLaudoRef } from '@/components/laudo/EditorLaudo';

const MODALIDADE_PILL: Record<ModalidadeLaudo, string> = {
  motor: 'bg-blue-100 text-blue-700',
  texto: 'bg-amber-100 text-amber-700',
  pdf: 'bg-gray-100 text-gray-600',
};
const MODALIDADE_LABEL: Record<ModalidadeLaudo, string> = {
  motor: 'Motor Senna',
  texto: 'Texto com modelo',
  pdf: 'PDF anexado',
};

const NOVO_ID = '__novo__';
const slug = (nome: string) => nome.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Payload é exatamente a whitelist da regra — campos opcionais só entram
// quando fazem sentido pra modalidade (undefined não pode ir no setDoc).
function payload(t: TipoLaudo) {
  const p: Record<string, unknown> = {
    id: t.id, nome: t.nome, icone: t.icone, ativo: t.ativo, ordem: t.ordem,
    modalidade: t.modalidade, atualizadoEm: serverTimestamp(),
  };
  if (t.modalidade === 'motor' && t.motorId) p.motorId = t.motorId;
  if (t.modalidade === 'texto' && t.modeloTexto !== undefined) p.modeloTexto = t.modeloTexto;
  return p;
}

export default function TiposLaudo() {
  const { workspace } = useAuth();
  const wsId = workspace?.id;

  const [tipos, setTipos] = useState<TipoLaudo[]>([]);
  const [loading, setLoading] = useState(true);
  const [semeando, setSemeando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TipoLaudo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const editorRef = useRef<EditorLaudoRef>(null);

  useEffect(() => {
    if (!wsId) return;
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'workspaces', wsId, 'tiposLaudo'), orderBy('ordem', 'asc')),
      snap => { setTipos(snap.docs.map(d => d.data() as TipoLaudo)); setLoading(false); },
      err => { console.error('TiposLaudo onSnapshot:', err); setLoading(false); }
    );
    return unsub;
  }, [wsId]);

  useEffect(() => {
    if (modalOpen) editorRef.current?.setContent(draft?.modeloTexto || '');
  }, [modalOpen, draft?.modeloTexto]);

  async function semear() {
    if (!wsId) return;
    setSemeando(true);
    const batch = writeBatch(db);
    for (const t of TIPOS_LAUDO_PADRAO) batch.set(doc(db, 'workspaces', wsId, 'tiposLaudo', t.id), payload(t));
    await batch.commit();
    setSemeando(false);
  }

  function abrirEdicao(t: TipoLaudo) {
    setEditandoId(t.id);
    setDraft({ ...t });
  }

  function abrirNovo() {
    const ordem = (tipos.reduce((max, t) => Math.max(max, t.ordem), 0)) + 1;
    setEditandoId(NOVO_ID);
    setDraft({ id: '', nome: '', icone: '📋', ativo: true, ordem, modalidade: 'texto', modeloTexto: '' });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setDraft(null);
  }

  async function salvarDraft() {
    if (!wsId || !draft) return;
    const nome = draft.nome.trim();
    if (!nome) { alert('Dê um nome ao tipo de exame.'); return; }
    const id = editandoId === NOVO_ID ? slug(nome) : draft.id;
    if (!id) { alert('Nome inválido pra gerar o identificador.'); return; }
    const final: TipoLaudo = { ...draft, id, nome };
    await setDoc(doc(db, 'workspaces', wsId, 'tiposLaudo', id), payload(final));
    cancelarEdicao();
  }

  async function alternarAtivo(t: TipoLaudo) {
    if (!wsId) return;
    await setDoc(doc(db, 'workspaces', wsId, 'tiposLaudo', t.id), payload({ ...t, ativo: !t.ativo }));
  }

  function salvarModelo() {
    if (!draft) return;
    setDraft({ ...draft, modeloTexto: editorRef.current?.getHTML() || '' });
    setModalOpen(false);
  }

  if (loading) return <div className="text-sm text-ink-3 py-8 text-center">Carregando catálogo...</div>;

  if (tipos.length === 0) {
    return (
      <div className="border border-borda rounded-xl p-6 text-center space-y-3">
        <p className="text-sm text-ink-2">Este local ainda não tem um catálogo de tipos de laudo.</p>
        <button onClick={semear} disabled={semeando}
          className="bg-p2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-p2-deep transition disabled:opacity-50">
          {semeando ? 'Semeando...' : 'Semear padrão'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tipos.map(t => (
        <div key={t.id} className="border border-borda rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="text-lg">{t.icone}</span>
            <button onClick={() => abrirEdicao(t)} className="font-semibold text-sm text-ink text-left hover:underline">{t.nome}</button>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${MODALIDADE_PILL[t.modalidade]}`}>
              {MODALIDADE_LABEL[t.modalidade]}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => alternarAtivo(t)}
                className={`relative w-10 h-5 rounded-full transition ${t.ativo ? 'bg-p2' : 'bg-borda'}`}
                title={t.ativo ? 'Ativo — clique pra desativar' : 'Inativo — clique pra ativar'}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition ${t.ativo ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {editandoId === t.id && draft && (
            <LinhaEdicao draft={draft} setDraft={setDraft} onSalvar={salvarDraft} onCancelar={cancelarEdicao}
              onEditarModelo={() => setModalOpen(true)} />
          )}
        </div>
      ))}

      {editandoId === NOVO_ID && draft ? (
        <div className="border border-borda rounded-lg overflow-hidden">
          <LinhaEdicao draft={draft} setDraft={setDraft} onSalvar={salvarDraft} onCancelar={cancelarEdicao}
            onEditarModelo={() => setModalOpen(true)} />
        </div>
      ) : (
        <button onClick={abrirNovo} className="text-sm font-semibold text-p2 hover:underline px-1 py-1">+ Tipo de exame</button>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-p1 text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
              <h2 className="font-bold text-sm">Editar modelo — {draft?.nome || 'novo tipo'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-white/70 hover:text-white text-lg">&times;</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <EditorLaudo ref={editorRef} placeholder="Modelo inicial do laudo..." />
            </div>
            <div className="px-5 py-3 border-t border-borda flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-ink-2 border border-borda rounded-lg hover:bg-surface">Cancelar</button>
              <button onClick={salvarModelo} className="px-6 py-2 text-sm bg-p2 text-white rounded-lg font-semibold hover:bg-p2-deep transition">Usar este modelo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Linha de edição expandida — nome, ícone, modalidade, motorId, modelo.
function LinhaEdicao({ draft, setDraft, onSalvar, onCancelar, onEditarModelo }: {
  draft: TipoLaudo;
  setDraft: (t: TipoLaudo) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  onEditarModelo: () => void;
}) {
  return (
    <div className="border-t border-borda bg-surface px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">Nome</label>
          <input type="text" value={draft.nome} onChange={e => setDraft({ ...draft, nome: e.target.value })}
            className="border border-borda rounded-lg px-3 py-1.5 text-sm bg-card w-56" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">Ícone</label>
          <input type="text" value={draft.icone} onChange={e => setDraft({ ...draft, icone: e.target.value })}
            className="border border-borda rounded-lg px-2 py-1.5 text-sm bg-card w-14 text-center" maxLength={4} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">Modalidade</label>
          <select value={draft.modalidade}
            onChange={e => setDraft({ ...draft, modalidade: e.target.value as ModalidadeLaudo })}
            className="border border-borda rounded-lg px-3 py-1.5 text-sm bg-card">
            <option value="motor">Motor Senna</option>
            <option value="texto">Texto com modelo</option>
            <option value="pdf">PDF anexado</option>
          </select>
        </div>
        {draft.modalidade === 'motor' && (
          <div>
            <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">Motor</label>
            <select value={draft.motorId || 'senna'} onChange={e => setDraft({ ...draft, motorId: e.target.value })}
              className="border border-borda rounded-lg px-3 py-1.5 text-sm bg-card">
              <option value="senna">Senna</option>
            </select>
          </div>
        )}
        {draft.modalidade === 'texto' && (
          <button onClick={onEditarModelo}
            className="border border-borda bg-card rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-2 hover:bg-ativo transition">
            Editar modelo
          </button>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancelar} className="px-3 py-1.5 text-sm text-ink-2 hover:underline">Cancelar</button>
        <button onClick={onSalvar} className="bg-p2 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-p2-deep transition">Salvar</button>
      </div>
    </div>
  );
}
